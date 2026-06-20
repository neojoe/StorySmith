from __future__ import annotations

from app.platforms.fanqienovel.publish import normalize_fanqie_editor_content


def test_normalize_fanqie_editor_content_strips_user_pattern():
    dirty = (
        "<p>&lt;p&gt;清晨的雨声像一张旧唱片在屋檐边慢慢转动，将整座小城的心情揉进湿冷的空气里。"
        "林舟蹲在床沿，手拢着被子边缘，眼睛盯着天花板的裂缝。"
        "&lt;/p&gt;&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;&lt;/p&gt;"
        "&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;午后，雨逐渐小，窗外的光线像灯下洗过的纸张。"
        "&lt;/p&gt;<br></p>"
    )
    clean = normalize_fanqie_editor_content(dirty)
    assert "<" not in clean
    assert "&lt;" not in clean
    assert "清晨的雨声像一张旧唱片" in clean
    assert "午后，雨逐渐小" in clean


def test_normalize_fanqie_editor_content_preserves_clean_plain_text():
    plain = "第一段。\n\n第二段。"
    assert normalize_fanqie_editor_content(plain) == plain


def test_normalize_fanqie_editor_content_handles_long_fanqie_payload():
    dirty = (
        "<p>&lt;p&gt;夜色把城市的喧嚣收进一个紧闭的窗户，设计工作室里只剩下空调的低鸣。"
        "&lt;/p&gt;&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;&lt;/p&gt;"
        "&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;灯光像铜质的潮水，从桌面滑过墙面。"
        "&lt;/p&gt;&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;&lt;/p&gt;"
        "&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;我知道今晚的睡眠并非普通的休息，而是一扇门。&lt;/p&gt;<br></p>"
    )
    clean = normalize_fanqie_editor_content(dirty)
    assert "<" not in clean
    assert "&lt;" not in clean
    assert "夜色把城市的喧嚣收进一个紧闭的窗户" in clean
    assert "灯光像铜质的潮水" in clean
    assert "今晚的睡眠并非普通的休息" in clean


def test_current_user_dirty_string():
    """Exact string from the latest user query (雨势在夜空里...)."""
    dirty = (
        '<p>&lt;p&gt;雨势在夜空里像被抖动的帘幕，落下无声的碎玉。雾港镇位于山脊低洼的河湾，雨霜潮声在泥路上化作细碎的脚步，'
        '我抵达时，街巷已是湿滑的镜面，映出灯影与屋檐相互缠绕的影子。远处的祠堂像一只沉默的巨兽，朱红的门楣上挂着的木牌因为潮气而发出潮湿的呻吟。'
        '风把雨催得更紧，湿润的气息里混着煤烟和草药的味道。作为一名初到此镇的书生，我来此的目的并非寻常的学问，而是想从那些被时间压过的传说里找到一个清晰的因果线。'
        '可传说像是潮水，一旦退去，留下的只是泥泞与回声。&lt;/p&gt;&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;&lt;/p&gt;&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;'
        '码头的。 不行。&lt;/p&gt;</p>'
    )
    clean = normalize_fanqie_editor_content(dirty)
    assert "<" not in clean, f"Found < in: {clean[:100]}"
    assert "&lt;" not in clean, f"Found &lt; in: {clean[:100]}"
    assert "雨势在夜空里像被抖动的帘幕" in clean
    assert "雾港镇位于山脊低洼的河湾" in clean
    assert "码头的" in clean
    assert len(clean) > 150, f"Clean text too short: {len(clean)} chars"
