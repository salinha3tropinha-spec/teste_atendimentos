"""
Bateria de Auditoria Anti-Glosa Rigorosa para Todos os Laudos do e-SISLA (Frase 6):
Valida os 7 critérios essenciais de blindagem contra glosas do DPME SP:
1. Zero parênteses () em justificativas de retroação extemporânea.
2. Zero duplicações gramaticais ('e e', 'com relato de relata/refere').
3. Eliminação total de hífen/traço residual após o nome do Médico Perito (Dr. Maykon sem '-').
4. Seção 'Atestado/Relatório/Exames Complementares' estritamente como 'Em anexo.'.
5. Zero duplicações de vinculação ao Rol de Atividades.
6. Exame físico sempre preenchido e semiológico em casos FAVORÁVEIS (jamais 'sem alterações incapacitantes').
7. Lateralidade anatômica 100% por extenso ('joelho direito', 'ombro esquerdo', 'membros inferiores bilaterais').
"""

import pytest
import re
from app import (
    _build_deterministic_esisla,
    _gatekeeper_anti_glosa_esisla,
    _sanitizar_texto_portugues_esisla,
    _remover_parenteses_texto,
    _clean_esisla_text,
)


def test_auditoria_criterio_1_zero_parenteses_retroacao():
    payload = {
        "nome": "Benedito R. Silva",
        "cargo": "Professor de Educação Básica II",
        "cid": "M54.4",
        "doenca_motivo": "Lombociatalgia aguda (CID M54.4)",
        "sintomas_limitacoes": "dor em coluna lombar com irradiação (14 dias de retroação)",
        "data_documento": "2026-01-10",
        "data_expedicao": "2026-01-24",
        "retroacao_invalida": True,
        "retroacao_dias": 14,
        "medico_perito": "Dr. Maykon -",
        "crm": "158158",
    }
    laudo = _gatekeeper_anti_glosa_esisla(_build_deterministic_esisla(payload), payload)

    m_just = re.search(r"\(\*\)\s*Justificativa Parecer Médico:?\s*\n(.*?)\n\s*\(\*\)\s*Parecer Final", laudo, re.DOTALL)
    assert m_just is not None
    just_body = m_just.group(1).strip()

    assert "(" not in just_body, f"Parêntese '(' encontrado: {just_body}"
    assert ")" not in just_body, f"Parêntese ')' encontrado: {just_body}"
    assert "totalizando 14 dias de retroação" in just_body
    assert "sob CID M54.4" in just_body


def test_auditoria_criterio_2_zero_duplicacoes_gramaticais():
    texto_problematico = (
        "O periciado apresenta dor intensa e e dormência no membro inferior direito e e limitações funcionais. "
        "com relato de relata queixa de dor lombar. com relato de refere piora ao sentar."
    )
    sanitizado = _remover_parenteses_texto(texto_problematico)
    sanitizado = _sanitizar_texto_portugues_esisla(sanitizado)

    assert not re.search(r"\b([eE])\s+(?:[eE]\b)+", sanitizado), f"Duplicidade 'e e' encontrada: {sanitizado}"
    assert "com relato de relata" not in sanitizado
    assert "com relato de refere" not in sanitizado
    assert "com relato de queixa" not in sanitizado


def test_auditoria_criterio_3_zero_traco_residual_medico_perito():
    payload = {
        "nome": "Carla Dias",
        "cargo": "Enfermeira",
        "cid": "M75.1",
        "doenca_motivo": "Síndrome do manguito rotador",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": 15,
        "medico_perito": "Dr. Maykon - ",
        "crm": "158158",
    }
    laudo = _gatekeeper_anti_glosa_esisla(_build_deterministic_esisla(payload), payload)

    m_med = re.search(r"^M[ée]dico\s*Perito:[ \t]*([^\r\n]+)$", laudo, re.MULTILINE)
    assert m_med is not None
    med_nome = m_med.group(1).strip()
    assert not med_nome.endswith("-"), f"Traço residual no nome do médico: '{med_nome}'"
    assert med_nome == "Dr. Maykon"


def test_auditoria_criterio_4_secao_atestado_estritamente_em_anexo():
    payload = {
        "nome": "Eduardo Ramos",
        "cargo": "Agente de Organização Escolar",
        "cid": "M54.5",
        "doenca_motivo": "Lombalgia crônica",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": 10,
        "relatorio_assistente": "Atestado Dr. Silva CRM 1234 emitido em 01/02/2026 sugerindo 10 dias",
    }
    laudo = _gatekeeper_anti_glosa_esisla(_build_deterministic_esisla(payload), payload)

    m_atest = re.search(r"Atestado/Relat[óo]rio(?:/Exames\s+Complementares)?:?\s*\n(.*?)\n\s*Pressão Arterial", laudo, re.DOTALL)
    assert m_atest is not None
    corpo_atestado = m_atest.group(1).strip()
    assert corpo_atestado == "Em anexo.", f"Atestado não está estritamente 'Em anexo.': '{corpo_atestado}'"


def test_auditoria_criterio_5_zero_duplicacao_vinculacao_rol():
    texto = (
        "limitação para locomoção, atividades inerentes ao cargo de Professor de Educação Básica II, "
        "atividades estas constantes no Rol de Atividades do cargo de Professor de Educação Básica II."
    )
    limpo = _sanitizar_texto_portugues_esisla(texto)
    assert "atividades inerentes ao cargo de" not in limpo
    assert "atividades estas constantes no Rol de Atividades do cargo de Professor de Educação Básica II." in limpo


def test_auditoria_criterio_6_exame_fisico_semiologico_em_favoravel():
    payloads_favoraveis = [
        {"cid": "M54.4", "doenca_motivo": "Lombociatalgia", "cargo": "Professor"},
        {"cid": "M75.1", "doenca_motivo": "Tendinopatia de ombro", "cargo": "Professor"},
        {"cid": "F32.2", "doenca_motivo": "Depressão grave", "cargo": "Professor"},
        {"cid": "M23.2", "doenca_motivo": "Lesão de menisco no joelho", "cargo": "Professor"},
    ]

    for p in payloads_favoraveis:
        p["parecer"] = "FAVORÁVEL"
        p["dias_solicitados"] = 30
        p["exame_fisico_descricao"] = "Sem alterações incapacitantes observadas no ato pericial."

        laudo = _gatekeeper_anti_glosa_esisla(_build_deterministic_esisla(p), p)

        m_ef = re.search(r"\(\*\)\s*Exame Físico Geral:?\s*\n(.*?)\n\s*Descrição das Alterações", laudo, re.DOTALL)
        assert m_ef is not None
        ef_body = m_ef.group(1).strip()

        # Glosas DPME nº 4 e nº 9: NUNCA permitir 'sem alterações incapacitantes' em laudo FAVORÁVEL!
        assert "sem alterações incapacitantes" not in ef_body.lower(), f"Glosa detectada para CID {p['cid']}: {ef_body}"
        assert len(ef_body) > 20, f"Exame físico insuficiente para CID {p['cid']}"


def test_auditoria_criterio_7_lateralidade_anatomica_por_extenso():
    texto_com_abreviacoes = (
        "Ao exame físico, apresenta dor no joelho D, limitação no ombro E, edema no tornozelo D, "
        "palpação dolorosa na perna E e fraqueza nos punhos B e pés B."
    )
    resultado = _gatekeeper_anti_glosa_esisla(
        f"Registro da perícia Médica para Licença\n\n(*) Exame Físico Geral:\n{texto_com_abreviacoes}\n\nDescrição das Alterações Clínicas encontradas e Relato dos Exames Complementares:\nNão foram apresentados exames complementares.\n\n(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s):\nLimitações.\n\n(*) Parecer Médico:\nFAVORÁVEL\nNº Dias: 10\nCID 10: M25.5\nDescrição: Dor articular\n\n(*) Resposta aos quesitos:\n1) Sim\n2) Sim\n3) Sim\n\n(*) Justificativa Parecer Médico:\nPrejudicada.\n\n(*) Parecer Final:\nNº Dias: 10",
        {"cid": "M25.5", "parecer": "FAVORÁVEL"}
    )

    assert "joelho direito" in resultado
    assert "ombro esquerdo" in resultado
    assert "tornozelo direito" in resultado
    assert "perna esquerda" in resultado
    assert "punhos bilaterais" in resultado
    assert "pés bilaterais" in resultado
    assert "joelho D" not in resultado
    assert "ombro E" not in resultado
    assert "punhos B" not in resultado
