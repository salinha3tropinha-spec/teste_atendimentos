from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GESTAO_ATD = (ROOT / "gestao_atendimentos.html").read_text(encoding="utf-8")
GESTAO_MED = (ROOT / "gestao_medicos.html").read_text(encoding="utf-8")
GESTAO_ADM = (ROOT / "gestao-medicos-admin.html").read_text(encoding="utf-8")


def test_gestao_atendimentos_table_pagination_limit_40():
    """Garante que a tabela de busca de atendimentos possui limite estrito de 40 itens por página."""
    assert "searchPageSize = 40" in GESTAO_ATD
    assert "tablePaginationFooter" in GESTAO_ATD
    assert "changeSearchPage" in GESTAO_ATD
    assert "renderTablePage" in GESTAO_ATD
    assert "renderPaginationUI" in GESTAO_ATD
    assert "page-nav-btn" in GESTAO_ATD
    assert "page-num-btn" in GESTAO_ATD


def test_gestao_medicos_table_pagination_limit_40():
    """Garante que o portal do médico possui limite de 40 atendimentos por página e paginador elegante."""
    assert "pageSize = 40" in GESTAO_MED
    assert "doctorPageNumbers" in GESTAO_MED
    assert "updateDoctorPaginationUI" in GESTAO_MED
    assert "goToDoctorPage" in GESTAO_MED


def test_gestao_medicos_admin_table_pagination_limit_40():
    """Garante que a gestão administrativa de médicos possui paginação de 40 médicos por página."""
    assert "doctorPageSize = 40" in GESTAO_ADM
    assert "doctorPaginationFooter" in GESTAO_ADM
    assert "renderDoctorPaginationUI" in GESTAO_ADM
    assert "changeDoctorPage" in GESTAO_ADM


def test_buttons_and_design_tokens_aligned_with_brand():
    """Garante que os botões possuem gradientes corporativos e estilos modernos da Ambiental."""
    assert "#0284C7" in GESTAO_ATD or "var(--blue)" in GESTAO_ATD
    assert "btn-primary" in GESTAO_ATD
    assert "btn-esisla" in GESTAO_ATD
    assert "btn-danger" in GESTAO_ATD
    assert "page-nav-btn" in GESTAO_MED
    assert "page-num-btn" in GESTAO_ADM


def test_search_toolbar_white_gap_and_tabs_overlap_fixed():
    """Garante remoção do espaço branco acima de Localizar atendimento e do corte nas abas."""
    css = (ROOT / "gestao_atendimentos.css").read_text(encoding="utf-8")
    js = (ROOT / "gestao_atendimentos.js").read_text(encoding="utf-8")

    assert "#view-busca #atendimentos.panel" in css
    panel_block = css.split("#view-busca #atendimentos.panel", 1)[1].split("}", 1)[0]
    assert "overflow: visible" in panel_block

    toolbar_block = css.split("#view-busca .search-toolbar", 1)[1].split("}", 1)[0]
    assert "position: static" in toolbar_block
    assert "top: auto" in toolbar_block

    tabs_block = css.split("#view-busca .tabs", 1)[1].split("}", 1)[0]
    assert "margin: 0" in tabs_block
    assert "display: flex" in tabs_block

    assert "preventScroll" in js
    assert "block:'center'" not in js


def test_configuracoes_tab_strictly_admin_only():
    """Garante que a aba e engrenagem de Configurações existem e são estritamente restritas a administradores."""
    html = (ROOT / "gestao_atendimentos.html").read_text(encoding="utf-8")
    js = (ROOT / "gestao_atendimentos.js").read_text(encoding="utf-8")

    assert 'id="sidebarConfigLink"' in html
    assert 'data-target="configuracoes"' in html
    assert 'id="topConfigBtn"' in html
    assert 'id="view-configuracoes"' in html
    assert html.count('data-admin-only="true"') >= 5
    assert 'id="sidebarConfigLink" data-target="configuracoes" data-admin-only="true" style="display:none"' in html
    assert 'id="topConfigBtn" data-admin-only="true" type="button"' in html
    assert 'style="display:none"' in html.split('id="topConfigBtn"', 1)[1].split(">", 1)[0]

    assert "applyAdminAccessVisibility" in js
    assert "configuracoes:'view-configuracoes'" in js
    assert "if(id==='configuracoes'&&!isAdmin())" in js
    assert "runAdminDiagnostics" in js
    assert "exportarAtendimentosCSV" in js
    assert "limparCacheGestaoLocal" in js


def test_dark_mode_in_configuracoes_and_css_persistence():
    """Garante presença de Modo Escuro configurável com persistência sem flash branco."""
    html = (ROOT / "gestao_atendimentos.html").read_text(encoding="utf-8")
    css = (ROOT / "gestao_atendimentos.css").read_text(encoding="utf-8")
    js = (ROOT / "gestao_atendimentos.js").read_text(encoding="utf-8")

    assert "ambiental_gestao_prefs_v1" in html
    assert 'id="themeOptLight"' in html
    assert 'id="themeOptDark"' in html
    assert 'id="themeOptAuto"' in html
    assert "setThemeMode('dark')" in html
    assert "html.theme-dark" in css
    assert "html.theme-dark #view-busca .search-toolbar" in css
    assert "html.theme-dark #view-busca .search-table-scroll td" in css
    assert "background: #111A2E !important;" in css
    assert "html.theme-dark #view-busca .table-pagination-footer" in css
    assert "html.theme-dark .dash-card-head" in css
    assert "html.theme-dark .kpi small" in css
    assert "html.theme-dark .esisla-card-block" in css
    assert "gestao_atendimentos.css?v=2.0.8" in html
    assert "canOpenEsisla" in js
    assert "setThemeMode" in js
    assert "resolveDarkMode" in js


def test_online_doctors_monitor_present():
    """Garante presença do visualizador de médicos on-line e em atendimento em tempo real."""
    html = (ROOT / "gestao_atendimentos.html").read_text(encoding="utf-8")
    css = (ROOT / "gestao_atendimentos.css").read_text(encoding="utf-8")
    js = (ROOT / "gestao_atendimentos.js").read_text(encoding="utf-8")
    app_py = (ROOT / "app.py").read_text(encoding="utf-8")
    auth_js = (ROOT / "auth.js").read_text(encoding="utf-8")

    assert "/api/presence/heartbeat" in app_py
    assert "/api/admin/medicos/online" in app_py
    assert "sendPresenceHeartbeat" in auth_js
    assert 'id="onlineDoctorsPanel"' in html
    assert 'id="onlineDoctorsTopChip"' in html
    assert "fetchOnlineDoctors" in js
    assert ".onl-doc-card" in css


