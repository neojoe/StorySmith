"""验证章节 HTML 清洗与阅文 content 字段生成（防双重 <p>&lt;p&gt;）。"""
from __future__ import annotations

from app.platforms.yuewen.browser import content_to_editor_html, text_to_editor_html
from app.services.novel_prompts import finalize_chapter_storage_text, strip_markup_to_plain_prose


def test_strip_double_wrapped_paragraph():
    raw = '<p>&lt;p&gt;夜色如墨，天曜王都。&lt;/p&gt;&lt;div class = "br "&gt;&lt;/div&gt;&lt;p&gt;&lt;/p&gt;</p>'
    plain = strip_markup_to_plain_prose(raw)
    assert "&lt;" not in plain
    assert "<" not in plain
    assert "夜色如墨" in plain


def test_finalize_removes_markup():
    raw = "<p>&lt;p&gt;测试正文&lt;/p&gt;</p>"
    out = finalize_chapter_storage_text(raw, "")
    assert "<" not in out
    assert "测试正文" in out


def test_content_to_editor_html_single_layer():
    dirty = '<p>&lt;p&gt;夜色如墨。&lt;/p&gt;&lt;div class=&quot;br&quot;&gt;&lt;/div&gt;</p>'
    html = content_to_editor_html(dirty)
    assert "&lt;" not in html
    assert "夜色如墨" in html
    # 不应再出现「字面量 &lt;p&gt;」
    assert html.count("<p>") <= html.count("</p>") + 2


def test_plain_text_still_wrapped():
    plain = "第一段\n\n第二段"
    html = content_to_editor_html(plain)
    assert "第一段" in html
    assert "第二段" in html
    assert "&lt;" not in html


def test_text_to_editor_html_escapes_angle_brackets():
    t = "a < b"
    h = text_to_editor_html(t)
    assert "&lt;" in h


def test_strip_curly_quotes_around_br_div():
    """截图类：class 两侧为弯引号、含空格的 br div。"""
    raw = (
        '<p>&lt;p&gt;宴席开始。&lt;/p&gt;&lt;div class= “br ”&gt;&lt;/div&gt;&lt;p&gt;'
        "在这里，洛霜并非只是一个&lt;/p&gt;</p>"
    )
    plain = strip_markup_to_plain_prose(raw)
    assert "&lt;" not in plain
    assert "<" not in plain
    assert "宴席开始" in plain
    assert "洛霜" in plain


def test_strip_numeric_entity_tags():
    raw = "&#60;p&#62;北境密信&#60;/p&#62;"
    plain = strip_markup_to_plain_prose(raw)
    assert "&#60;" not in plain
    assert "北境密信" in plain


def test_strip_fullwidth_angle_brackets():
    raw = "＜p＞全角尖括号段落＜/p＞"
    plain = strip_markup_to_plain_prose(raw)
    assert "＜" not in plain
    assert "全角尖括号段落" in plain
