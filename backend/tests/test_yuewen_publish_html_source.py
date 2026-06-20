from __future__ import annotations

from app.platforms.yuewen.browser import content_to_editor_html


def test_publish_should_not_trust_chapter_content_format_from_save_response():
    dirty_from_site = (
        '<p>&lt;p&gt;清晨的雾，如薄纱般笼罩着海面。&lt;/p&gt;'
        '&lt;div class=“br“&gt;&lt;/div&gt;&lt;p&gt;海风穿过帆影。&lt;/p&gt;</p>'
    )
    clean_source = "清晨的雾，如薄纱般笼罩着海面。\n\n海风穿过帆影。"

    rebuilt = content_to_editor_html(clean_source)

    assert "&lt;p&gt;" not in rebuilt
    assert "&lt;/p&gt;" not in rebuilt
    assert "&lt;div" not in rebuilt
    assert "清晨的雾，如薄纱般笼罩着海面。" in rebuilt
    assert "海风穿过帆影。" in rebuilt

    # 说明：如果错误地信任站点回包，这些实体会继续带到 publishChapter。
    assert "&lt;p&gt;" in dirty_from_site
