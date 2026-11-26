import pytest
from app import app

def test_auth_headers_and_sync_helpers():
    # Verifica que app.py possui os tratamentos para preservar numero e tratar IntegrityError
    source = open("app.py", encoding="utf-8").read()
    assert "target_number = str(oldrow.get(\"numero\") or number or \"\").strip()" in source
    assert "oldrow = None" in source
    assert "if rid:" in source
    assert "if not oldrow and number:" in source
    assert "IntegrityError ao salvar atendimento" in source

def test_auth_js_headers_export():
    auth_src = open("auth.js", encoding="utf-8").read()
    assert "function headers(custom = {})" in auth_src
    assert "headers," in auth_src
    assert "window.AmbientalAuth" in auth_src

def test_assistente_js_sync_and_protocolo():
    asst_src = open("ambiental_assistente.js", encoding="utf-8").read()
    # Verifica que protocoloParam não sobrescreve atendimento quando recuperado do servidor
    assert "state.aux.protocolo = protocoloParam;" in asst_src
    assert "if (!recovered && (!state.atendimento || isNew)) {" in asst_src
    # Verifica auto-cura de DUPLICATE_ATENDIMENTO quando há serverId
    assert "if(state.__serverId && String(state.atendimento) !== String(state.__serverId))" in asst_src
    # Verifica tratamento seguro em verificarHistoricoPericiado
    assert "typeof window.AmbientalAuth.headers === \"function\"" in asst_src
