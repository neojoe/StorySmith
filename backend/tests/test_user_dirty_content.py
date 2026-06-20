"""验证用户报告的实际脏数据经过完整管线后输出正确。"""
from __future__ import annotations

from app.platforms.yuewen.browser import content_to_editor_html, text_to_editor_html
from app.services.novel_prompts import finalize_chapter_storage_text, strip_markup_to_plain_prose


DIRTY = (
    '<p>&lt;p&gt;雨夜落下细密的雨点，敲击着宿舍窗框，像在催促这座城市把最后的光亮收起来。'
    '期末前的夜晚，总是格外安静，走廊尽头的灯光像一条细细的线，把人们的影子拉得很长。'
    '沈雨晴关掉桌上的台灯，宿舍床头的闹钟滴答着，时间的声音在她耳边逐渐清晰。'
    '她以为自己只是一个普通的高中生，背后却发生着一个她尚未完全理解的门。'
    '直到今晚，她才意识到自己的记忆里藏着一个新的轮回——一个能让她记住同一天全貌的异样能力。'
    '&lt;/p&gt;&lt;div class="br"&gt;&lt;/div&gt;&lt;p&gt;&lt;/p&gt;'
    '&lt;div class="br"&gt;&lt;/div&gt;&lt;p&gt;'
    '雨夜的雨点像细小的算盘珠，在窗框上敲击出节拍。'
    '雨晴深吸一口气，心跳却&lt;/p&gt;</p>'
)

DIRTY_2 = (
    '<p>&lt;p&gt;考试成绩的数字像一枚突如其来的铁锤，重重地敲在我的胸口。'
    '走进教室的门仿佛被按下了一个无形的起始键，空气里都是焦灼的味道。'
    '英语科目的分数在屏幕上滚动着，我的名字出现在第十六名，和上一次测验差不多，甚至还略有下降。'
    '老师的表情没有怜悯，却多了一份无可奈何的叹息。我低着头，抓紧桌面边缘的木纹，指节发白。'
    '站在我对面的秦洛正对着屏幕咧开一个自信的笑，他的分数和姿态像是一道不可逾越的墙。'
    '我的心跳在胸腔里乱窜，仿佛要把薄薄的胸腔撑裂。'
    '考试没考好，这个现实像一张冷硬的网，紧紧缠住了我的颈部，让我连呼吸都变得困难。'
    '&lt;/p&gt;&lt;div class="br"&gt;&lt;/div&gt;&lt;p&gt;'
    '下课铃响了。&lt;/p&gt;</p>'
)

EXPECTED_FRAGMENTS = ["雨夜落下细密的雨点", "沈雨晴关掉桌上的台灯", "雨夜的雨点像细小的算盘珠"]


def _assert_no_markup(text: str, label: str = ""):
    assert "&lt;" not in text, f"[{label}] found &lt; in: {text[:100]}"
    assert "&gt;" not in text, f"[{label}] found &gt; in: {text[:100]}"
    assert "<p>" not in text, f"[{label}] found <p> in: {text[:100]}"
    assert "<div" not in text, f"[{label}] found <div in: {text[:100]}"
    assert "</p>" not in text, f"[{label}] found </p> in: {text[:100]}"
    assert "</div>" not in text, f"[{label}] found </div> in: {text[:100]}"


def _assert_editor_html_clean(html: str, label: str = ""):
    """Editor HTML should have <p>…</p> and <div class="br"></div> but NOT entity-escaped tags inside."""
    assert "&lt;p&gt;" not in html, f"[{label}] found entity-escaped <p> in editor HTML: {html[:200]}"
    assert '&lt;div' not in html, f"[{label}] found entity-escaped <div in editor HTML: {html[:200]}"
    assert "&lt;/p&gt;" not in html, f"[{label}] found entity-escaped </p> in editor HTML: {html[:200]}"


def test_strip_user_dirty_string():
    """strip_markup_to_plain_prose must completely clean the user's exact dirty string."""
    plain = strip_markup_to_plain_prose(DIRTY)
    _assert_no_markup(plain, "strip")
    for frag in EXPECTED_FRAGMENTS:
        assert frag in plain, f"Missing expected text: {frag}"


def test_finalize_user_dirty_string():
    """finalize_chapter_storage_text must produce clean plain text."""
    out = finalize_chapter_storage_text(DIRTY, "")
    _assert_no_markup(out, "finalize")
    for frag in EXPECTED_FRAGMENTS:
        assert frag in out, f"Missing expected text: {frag}"


def test_content_to_editor_html_from_clean_text():
    """When DB has clean text, editor HTML must be properly structured."""
    clean = "雨夜落下细密的雨点\n\n雨夜的雨点像细小的算盘珠"
    html = content_to_editor_html(clean)
    _assert_editor_html_clean(html, "clean→editor")
    assert "<p>雨夜落下细密的雨点</p>" in html


def test_content_to_editor_html_from_dirty_string():
    """Even if DB had dirty content, content_to_editor_html must produce clean editor HTML."""
    html = content_to_editor_html(DIRTY)
    _assert_editor_html_clean(html, "dirty→editor")
    for frag in EXPECTED_FRAGMENTS:
        assert frag in html, f"Missing expected text in editor HTML: {frag}"


def test_full_publish_pipeline_clean_db():
    """Simulate: clean DB text → create_chapter strip → _save_chapter content_to_editor_html."""
    db_content = (
        "雨夜落下细密的雨点，敲击着宿舍窗框。\n\n"
        "雨夜的雨点像细小的算盘珠，在窗框上敲击出节拍。雨晴深吸一口气，心跳却"
    )
    scrubbed = strip_markup_to_plain_prose(db_content)
    assert scrubbed == db_content, "Clean text should pass through unchanged"
    html = content_to_editor_html(scrubbed)
    _assert_editor_html_clean(html, "full-pipeline-clean")


def test_full_publish_pipeline_dirty_db():
    """Simulate: dirty DB text → create_chapter strip → _save_chapter content_to_editor_html."""
    scrubbed = strip_markup_to_plain_prose(DIRTY)
    _assert_no_markup(scrubbed, "pipeline-strip")
    html = content_to_editor_html(scrubbed)
    _assert_editor_html_clean(html, "pipeline-editor")


def test_editor_html_not_double_wrapped():
    """If content_to_editor_html output is accidentally fed back in, it must NOT double-wrap."""
    clean = "第一段\n\n第二段"
    first_pass = content_to_editor_html(clean)
    second_pass = content_to_editor_html(first_pass)
    _assert_editor_html_clean(second_pass, "double-wrap")
    assert "第一段" in second_pass
    assert "第二段" in second_pass


def test_text_to_editor_html_defense_with_html_input():
    """text_to_editor_html should auto-strip HTML if caller forgets to use content_to_editor_html."""
    html_input = '<p>雨夜落下细密的雨点</p><div class="br"></div><p></p><div class="br"></div><p>雨夜的雨点像细小的算盘珠</p>'
    result = text_to_editor_html(html_input)
    _assert_editor_html_clean(result, "text_to_editor defense")
    assert "雨夜落下细密的雨点" in result
    assert "雨夜的雨点像细小的算盘珠" in result


def test_text_to_editor_html_defense_with_entity_input():
    """text_to_editor_html should auto-strip entity-escaped HTML."""
    entity_input = '&lt;p&gt;测试正文&lt;/p&gt;&lt;div class="br"&gt;&lt;/div&gt;'
    result = text_to_editor_html(entity_input)
    _assert_editor_html_clean(result, "text_to_editor entity defense")
    assert "测试正文" in result


def test_text_to_editor_html_defense_with_user_dirty():
    """text_to_editor_html should handle the user's exact dirty string directly."""
    result = text_to_editor_html(DIRTY)
    _assert_editor_html_clean(result, "text_to_editor user dirty")
    for frag in EXPECTED_FRAGMENTS:
        assert frag in result, f"Missing expected text: {frag}"


# ── User report #2: 考试成绩 ──────────────────────────────────────────────────

EXPECTED_FRAGMENTS_2 = ["考试成绩的数字像一枚突如其来的铁锤", "秦洛正对着屏幕咧开一个自信的笑", "下课铃响了"]


def test_strip_user_dirty_2():
    plain = strip_markup_to_plain_prose(DIRTY_2)
    _assert_no_markup(plain, "strip-dirty2")
    for frag in EXPECTED_FRAGMENTS_2:
        assert frag in plain, f"Missing: {frag}"


def test_finalize_user_dirty_2():
    out = finalize_chapter_storage_text(DIRTY_2, "")
    _assert_no_markup(out, "finalize-dirty2")
    for frag in EXPECTED_FRAGMENTS_2:
        assert frag in out, f"Missing: {frag}"


def test_content_to_editor_html_dirty_2():
    html = content_to_editor_html(DIRTY_2)
    _assert_editor_html_clean(html, "dirty2→editor")
    for frag in EXPECTED_FRAGMENTS_2:
        assert frag in html, f"Missing: {frag}"


def test_api_read_sanitize():
    """Simulate _sanitize_chapter_content: if DB has dirty content, API response is clean."""
    from app.api.v1.novel import _sanitize_chapter_content

    row = {"id": "test-1", "content": DIRTY_2, "word_count": 999}
    sanitized = _sanitize_chapter_content(row)
    _assert_no_markup(sanitized["content"], "api-sanitize")
    for frag in EXPECTED_FRAGMENTS_2:
        assert frag in sanitized["content"], f"Missing: {frag}"
    assert sanitized["word_count"] != 999, "word_count should be updated"


def test_api_sanitize_clean_passthrough():
    """Clean content should pass through _sanitize_chapter_content unchanged."""
    from app.api.v1.novel import _sanitize_chapter_content

    row = {"id": "test-2", "content": "干净的纯文本正文。\n\n第二段。", "word_count": 12}
    sanitized = _sanitize_chapter_content(row)
    assert sanitized["content"] == row["content"]
    assert sanitized["word_count"] == 12


def test_latest_user_string_through_yuewen_chain():
    dirty = (
        '<p>&lt;p&gt;清晨的雾，如薄纱般笼罩着海面，灯塔的光柱在潮湿的空气里挣扎成一条条银色的线。'
        '林澜站在靠港的甲板上，呼吸里混着盐味与煤烟的苦涩。她不是老练的外交官，却带着不容置喙的冷静——'
        '新任对外使节，肩上担着一个世界对她的信任与试探。她要到三域之间的龙脉般的博弈里去走一遭，调查一枚传说中的古徽记，'
        '看看它究竟隐藏着怎样的力量。港口的市声像潮汐一样起伏，来自银海帝国的商队、来自晨星王朝的传教队、来自阿拉克王国的使团'
        '混杂在一起，彼此礼仪、舌音、货色交叠，仿佛一张多语的网，随时会将人困在说不清的情谊与利益之间。'
        '&lt;/p&gt;&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;&lt;/p&gt;&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;'
        '海风穿过帆影，吹动林澜披在肩上的薄袍。她整理思路，记下这座城市的第一条信息：雾港的外域使团并非按常理结队，而是以'
        '“礼仪之家“与“智识之馆“并立。前者负责日常交往与面子，后者掌握学问与秘密。若要深入，不能只看嘴皮子，还要看他们把话说到哪一步、'
        '把证据放到何处。&lt;/p&gt;&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;&lt;/p&gt;&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;'
        '她的第一幕任务，是在雾港口岸与一位银海帝国的女学者会面。她。。'
    )
    plain = strip_markup_to_plain_prose(dirty)
    html = content_to_editor_html(dirty)
    _assert_no_markup(plain, "latest-yuewen-plain")
    _assert_editor_html_clean(html, "latest-yuewen-html")
    assert "清晨的雾，如薄纱般笼罩着海面" in plain
    assert "海风穿过帆影" in plain
    assert "银海帝国的女学者会面" in plain
