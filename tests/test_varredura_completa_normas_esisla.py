"""
Varredura Completa e Auditoria de Todos os Laudos do e-SISLA DPME SP:
Valida sistematicamente todas as 6 regras anti-glosa em dezenas de laudos reais:
1. Zero parênteses em justificativas de retroação.
2. Zero duplicidade de 'e e'.
3. Zero traço órfão no CRM ou Médico Perito.
4. Campo Atestado estritamente como 'Em anexo.'.
5. Zero duplicação do rol de atividades.
6. Lateralidade anatômica 100% por extenso.
"""

import pytest
import re
from app import (
    _build_deterministic_esisla,
    _gatekeeper_anti_glosa_esisla,
    _sanitizar_texto_portugues_esisla,
    _remover_parenteses_texto,
)


def auditar_laudo_esisla_rigorosamente(laudo: str, is_retroacao: bool = False):
    assert laudo, "Laudo não pode ser vazio"

    # 1. Zero parênteses em justificativas de retroação
    m_just = re.search(r"\(\*\)\s*Justificativa Parecer Médico:?\s*\n(.*?)\n\s*\(\*\)\s*Parecer Final", laudo, re.DOTALL)
    assert m_just is not None, "Seção Justificativa Parecer Médico ausente"
    just_body = m_just.group(1).strip()
    if is_retroacao or "retroa" in just_body.lower():
        assert "(" not in just_body, f"Parêntese '(' encontrado na justificativa de retroação: {just_body}"
        assert ")" not in just_body, f"Parêntese ')' encontrado na justificativa de retroação: {just_body}"

    # 2. Zero duplicidade 'e e' e 'ou ou'
    assert not re.search(r"\b([eE])(?:[\s,]+[eE])+\b", laudo), f"Duplicidade 'e e' encontrada no laudo:\n{laudo}"
    assert not re.search(r"\b([oO]u)(?:[\s,]+[oO]u)+\b", laudo), f"Duplicidade 'ou ou' encontrada no laudo:\n{laudo}"

    # 3. CRM e Médico Perito sem traço órfão
    m_crm = re.search(r"^CRM:[ \t]*([^\r\n]*)$", laudo, re.MULTILINE)
    if m_crm:
        crm_val = m_crm.group(1).strip()
        assert not crm_val.endswith("-"), f"Traço órfão no final do CRM: '{crm_val}'"
        assert crm_val != "-", "CRM composto apenas por hífen órfão"

    m_med = re.search(r"^M[ée]dico\s*Perito:[ \t]*([^\r\n]*)$", laudo, re.MULTILINE)
    if m_med:
        med_val = m_med.group(1).strip()
        assert not med_val.endswith("-"), f"Traço órfão no final do Médico Perito: '{med_val}'"
        assert med_val != "-", "Médico Perito composto apenas por hífen órfão"

    # 4. Campo Atestado estritamente 'Em anexo.'
    m_atest = re.search(r"(?:Atestado/Relat[óo]rio/Exames\s+Complementares|Atestado/Relat[óo]rio):?\s*\n(.*?)\n\s*Pressão Arterial", laudo, re.DOTALL)
    assert m_atest is not None, "Seção Atestado/Relatório ausente"
    atest_body = m_atest.group(1).strip()
    assert atest_body == "Em anexo.", f"Campo Atestado deve ser 'Em anexo.', obtido: '{atest_body}'"

    # 5. Zero duplicação do rol de atividades
    assert "atividades inerentes ao cargo de" not in laudo, "Vinculação redundante de cargo no rol encontrada"
    assert not re.search(r"(atividades\s+estas\s+constantes\s+no\s+Rol\s+de\s+Atividades[^\n\r.]+?)[\s,;]+(?:\1|atividades\s+estas\s+constantes)", laudo, re.IGNORECASE), "Rol duplicado encontrado"
    assert not re.search(r"(constantes\s+no\s+[rR]ol\s+de\s+[aA]tividades[^\n\r,.]+?)[\s,;]+(?:\1|constantes\s+no\s+[rR]ol)", laudo, re.IGNORECASE), "Rol duplicado encontrado"

    # 6. Lateralidade anatômica 100% por extenso
    assert not re.search(r"\b(joelho|ombro|punho|cotovelo|braço|antebraço|pé|quadril|tornozelo)\s+[DEB]\b", laudo), f"Sigla de lateralidade encontrada no laudo:\n{laudo}"
    assert not re.search(r"\b(mão|perna|coxa|escápula)\s+[DEB]\b", laudo), f"Sigla de lateralidade feminina encontrada no laudo:\n{laudo}"
    assert not re.search(r"\b(MID|MIE|MSD|MSE|MMII|MMSS)\b", laudo), f"Sigla de membro encontrada no laudo:\n{laudo}"
    assert not re.search(r"\bà\s+[DE]\b", laudo), f"Direcional abreviado encontrado no laudo:\n{laudo}"


CASOS_VARREDURA = [
    # 1. Ortopedia - Retroação > 3 dias (Armadilha de Parênteses e 'e e')
    {
        "nome": "João Silva",
        "sexo": "M",
        "idade": "42",
        "cargo": "Servidor Público Estadual",
        "cid": "M54.4",
        "doenca_motivo": "Lombociatalgia aguda (CID M54.4)",
        "sintomas_limitacoes": "dor em região lombar com piora recente e irradiação para o MID acompanhada de dormência, apresentando marcha claudicante e limitação para flexão do tronco e",
        "data_documento": "2026-01-15",
        "data_expedicao": "2026-01-29",
        "retroacao_invalida": True,
        "retroacao_dias": 14,
        "medico_perito": "Dr. Maykon -",
        "crm": "158158 -",
        "is_retro": True,
    },
    # 2. Ortopedia - Ombro e cotovelo com lateralidades D e E
    {
        "nome": "Maria Helena",
        "sexo": "F",
        "idade": "49",
        "cargo": "Professora de Educação Básica II",
        "cid": "M75.1",
        "doenca_motivo": "Síndrome do manguito rotador D",
        "sintomas_limitacoes": "dor no ombro D e cotovelo E com irradiação para o MSD e MSE",
        "exame_fisico_descricao": "Teste de Neer positivo no ombro D e dor à palpação no cotovelo E. Lasègue negativo bilateralmente.",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": 30,
        "medico_perito": "Dr. Maykon - ",
        "crm": "158158",
        "is_retro": False,
    },
    # 3. Servidor Readaptado com queixa de base
    {
        "nome": "Carlos Drummond",
        "sexo": "M",
        "idade": "54",
        "cargo": "Oficial Administrativo",
        "readaptado": "Sim",
        "atividades_readaptado": "serviços de digitação sem atendimento ao público e sem carregar peso",
        "cid": "M54.5",
        "doenca_motivo": "Lombalgia crônica",
        "sintomas_limitacoes": "dor lombar residual ao final do expediente",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": 0,
        "medico_perito": "Dr. Maykon",
        "crm": "158158 - ",
        "is_retro": False,
    },
    # 4. Acompanhamento Familiar - CID Z76.3
    {
        "nome": "Fernanda Torres",
        "sexo": "F",
        "idade": "38",
        "cargo": "Agente de Organização Escolar",
        "cid": "Z76.3",
        "doenca_motivo": "Acompanhamento de genitor enfermo",
        "sintomas_limitacoes": "assiste genitor internado em UTI",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": 0,
        "medico_perito": "Dr. Maykon -",
        "crm": "158158",
        "is_retro": False,
    },
    # 5. Neurologia e Membros Inferiores - Joelho e Tornozelo
    {
        "nome": "Lucas Silveira",
        "sexo": "M",
        "idade": "35",
        "cargo": "Policial Penal",
        "cid": "M23.2",
        "doenca_motivo": "Lesão de menisco no joelho D",
        "sintomas_limitacoes": "edema no joelho D e dor no tornozelo D com claudicação",
        "exame_fisico_descricao": "Apresenta dor em joelho D à flexão e dor em pé D ao ortostatismo. Lasègue positivo à D a 45 graus.",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": 45,
        "medico_perito": "Dr. Maykon",
        "crm": "158158 -",
        "is_retro": False,
    },
    # 6. Saúde Mental e Polifarmácia com ajuste recente
    {
        "nome": "Renata Vasconcelos",
        "sexo": "F",
        "idade": "44",
        "cargo": "Supervisora de Ensino",
        "cid": "F33.2",
        "doenca_motivo": "Transtorno depressivo recorrente grave",
        "sintomas_limitacoes": "anedonia, choro fácil e ideação de ruína",
        "medications": ["Venlafaxina 150 mg/dia", "Quetiapina 50 mg/dia", "Clonazepam 2 mg/dia", "Mirtazapina 30 mg/dia"],
        "ajuste_dose": True,
        "queixa_duracao": "Apresenta quadro depressivo grave. Teve ajuste recente de dose de Venlafaxina.",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": 60,
        "medico_perito": "Dr. Maykon - ",
        "crm": "158158 - ",
        "is_retro": False,
    },
    # 7. Paciente Oncológico em Quimioterapia
    {
        "nome": "Regina Duarte",
        "sexo": "F",
        "idade": "58",
        "cargo": "Professora de Educação Básica I",
        "cid": "C50.9",
        "doenca_motivo": "Neoplasia maligna de mama D",
        "sintomas_limitacoes": "em tratamento quimioterápico com fadiga extrema e náuseas",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": 90,
        "medico_perito": "Dr. Maykon -",
        "crm": "158158 -",
        "is_retro": False,
    },
    # 8. Reumatologia - Punhos e Mãos Bilaterais
    {
        "nome": "Patrícia Poeta",
        "sexo": "F",
        "idade": "41",
        "cargo": "Escrivã de Polícia",
        "cid": "M05.8",
        "doenca_motivo": "Artrite reumatoide soropositiva",
        "sintomas_limitacoes": "rigidez matinal prolongada e dor nos punhos B e mãos B",
        "exame_fisico_descricao": "Sinovite palpável nos punhos B e edema nas articulações interfalangeanas das mãos B.",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": 30,
        "medico_perito": "Dr. Maykon",
        "crm": "158158",
        "is_retro": False,
    },
]


@pytest.mark.parametrize("caso", CASOS_VARREDURA)
def test_varredura_caso_completo(caso):
    laudo = _gatekeeper_anti_glosa_esisla(_build_deterministic_esisla(caso), caso)
    auditar_laudo_esisla_rigorosamente(laudo, is_retroacao=caso.get("is_retro", False))
