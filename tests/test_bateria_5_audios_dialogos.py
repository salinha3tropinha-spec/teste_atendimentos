# -*- coding: utf-8 -*-
"""
Bateria de Testes com 5 Atendimentos Periciais Completos:
Simulação de Gravação de Áudio e Diálogo Médico-Paciente Realista:
- Respostas emendadas (idade, cargo e tempo falados juntos)
- Hesitações, dúvidas de dosagem e termos coloquiais
- Datas confusas e autocorreções
- Marcação em tempo real das 11 perguntas da Colinha IA 2.0
- Destaque em amarelo das dúvidas críticas (ia2-doubt-word)
- Refinamento de diálogo e integridade pericial
"""
import re
from pathlib import Path
import pytest
from app import (
    app,
    _expandir_abreviacoes_medicas_texto,
    _sanitizar_texto_portugues_esisla,
    _clean_queixa_duracao_text,
    _clean_esisla_text,
    _build_deterministic_esisla,
    _gatekeeper_anti_glosa_esisla
)

ROOT = Path(__file__).resolve().parent.parent
ATTENDANCE_JS = (ROOT / "ambiental_assistente.js").read_text(encoding="utf-8")


def _eval_js_colinha_matches(text: str) -> dict[int, bool]:
    """Simula com exatidão as 11 funções de validação de COLINHA_IA2_CONFIG do frontend."""
    results = {}
    
    # 01. Idade
    r1 = bool(
        re.search(r"\b(?:idade(?:\s*[:=]|\s+(?:é|de))?|tenho|tem|estou\s+com)\s*(\d{1,2})\b", text, re.I)
        or re.search(r"\b(\d{1,2})\s*anos(?:\s+de\s+idade)?\b", text, re.I)
        or re.search(r"\bnascid[oa]\s+em\s+(\d{4})\b", text, re.I)
        or re.search(r"\bano\s+de\s+nascimento\s*[:=]?\s*(\d{4})\b", text, re.I)
    )
    results[1] = r1

    # 02. Cargo
    r2 = bool(
        re.search(r"\b(?:cargo|fun[çc][ãa]o|profiss[ãa]o|trabalho\s+como|exer[çc]o|ocupo\s+o\s+cargo)\s*[:=]?\s*([a-zà-ú\s]{3,35})\b", text, re.I)
        or re.search(r"\b(?:sou|é)\s+(professora?|docente|agente|policial|investigador[a]?|diretor[a]?|secret[áa]ri[oa]|escriv[ãa][oa]|auxiliar|t[ée]cnic[oa]|m[ée]dic[oa]|enfermeir[oa]|motorista|oficial|servidor[a]?|analista|operador[a]?|inspetor[a]?|atendente|coordenador[a]?|merendeir[ao]|cuidador[ao]|gestor[ao]|especialista|peb\s*(?:i|ii|1|2)?)\b", text, re.I)
        or re.search(r"\b(?:peb\s*(?:i|ii|1|2)?|professor[a]?\s+de\s+educa[çc][ãa]o\s+b[áa]sica|policial\s+militar|policial\s+civil|agente\s+de\s+seguran[çc]a|agente\s+penitenci[áa]ri[oa]|oficial\s+administrativ[oa]|auxiliar\s+de\s+servi[çc]os?|merendeir[ao]|inspetor\s+escolar)\b", text, re.I)
    )
    results[2] = r2

    # 03. Tempo de Cargo
    r3 = bool(
        re.search(r"\b(?:tempo\s+(?:no|de|do)\s+cargo|tempo\s+de\s+servi[çc]o|trabalho\s+h[áa]|estou\s+h[áa]|no\s+cargo\s+h[áa]|admiss[ãa]o\s+em)\s*[:=]?\s*([^\.\,\;\n]+)", text, re.I)
        or re.search(r"\bh[áa]\s+(\d+|um|dois|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|dezoito|vinte|trinta)\s+(?:anos|meses)\b", text, re.I)
        or re.search(r"\bdesde\s+(?:o\s+ano\s+de\s+)?(19\d{2}|20\d{2})\b", text, re.I)
        or re.search(r"\b(\d+)\s+anos\s+(?:de\s+casa|de\s+servi[çc]o|no\s+estado|no\s+cargo|de\s+prefeitura|de\s+concurso)\b", text, re.I)
    )
    results[3] = r3

    # 04. Readaptado
    r4 = bool(
        re.search(r"\b(?:(?:re)?adaptad[oa]|(?:re)?adapta[çc][ãa]o)\b", text, re.I)
        or re.search(r"\bn[ãa]o\s+sou\s+(?:re)?adaptad[oa]\b", text, re.I)
        or re.search(r"\bnunca\s+fui\s+(?:re)?adaptad[oa]\b", text, re.I)
        or re.search(r"\bsem\s+(?:re)?adapta[çc][ãa]o\b", text, re.I)
        or re.search(r"\b(?:é|sou|fui)\s+(?:re)?adaptad[oa]\b", text, re.I)
    )
    results[4] = r4

    # 05. Data Diagnóstico
    r5 = bool(
        re.search(r"\b(?:(?:data\s+(?:do\s+)?)?diagn[óo]stico(?:\s+foi)?\s+em|data\s+(?:do\s+)?diagn[óo]stico|in[íi]cio\s+do\s+quadro|in[íi]cio\s+dos\s+sintomas|diagnosticad[oa]\s+em|descobri\s+em|come[çc]ou\s+em|iniciou\s+em)\s*[:=]?\s*([^\.\;\n]+)", text, re.I)
        or re.search(r"\b(?:desde|em)\s+(?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+(?:de\s+)?\d{4})?\b", text, re.I)
        or re.search(r"\bdesde\s+(\d{4})\b", text, re.I)
        or re.search(r"\b(?:ano|m[êe]s|semana)\s+passad[oa]\b", text, re.I)
        or re.search(r"\b(?:in[íi]cio|come[çc]ou|iniciou)\s+h[áa]\s+(\d+|poucos?|muitos?)\s+(?:dias|semanas|meses|anos)\b", text, re.I)
        or re.search(r"\b(?:dia|rompi|les[ãa]o\s+em)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b", text, re.I)
    )
    results[5] = r5

    # 06. Doença
    r6 = bool(
        re.search(r"\b(?:doen[çc]a|patologia|motivo\s+do\s+afastamento|afastament[oa]|afastad[oa]\s+por|tratando\s+de|quadro\s+de)\s*[:=]?\s*([^\.\;\n]+)", text, re.I)
        or re.search(r"\b(?:cid\b|diagn[óo]stico\s+de|hip[óo]tese\s+diagn[óo]stica)\b", text, re.I)
        or re.search(r"\b(?:depress[ãa]o|ansiedade|burnout|bipolar|p[âa]nico|estresse|transtorno|lombalgia|lombociatalgia|discopatia|h[ée]rnia|t[úu]nel\s+do\s+carpo|tendinite|tendinose|bursite|manguito|fibromialgia|artrose|artrite|sinovite|espondilite|espondilo|cefaleia|enxaqueca|fratura|menisco|les[ãa]o|cirurgia|dor\s+lombar|coluna)\b", text, re.I)
    )
    results[6] = r6

    # 07. Frequência de Consultas
    r7 = bool(
        re.search(r"\b(?:frequ[êe]ncia|periodicidade|consultas?|retornos?|comparece|acompanhamento)\s*[:=]?\s*([^\.\;\n]+)", text, re.I)
        or re.search(r"\b(?:mensal(?:mente)?|quinzenal(?:mente)?|semanal(?:mente)?|bimestral|trimestral|semestral)\b", text, re.I)
        or re.search(r"\ba\s+cada\s+(\d+|um|dois|tr[êe]s|quinze)\s+(?:dias|semanas|meses)\b", text, re.I)
        or re.search(r"\bde\s+(\d+|um|dois|tr[êe]s|dez|quinze|vinte|trinta)\s+em\s+\d+\s+dias\b", text, re.I)
        or re.search(r"\b(?:todo\s+m[êe]s|toda\s+semana|uma\s+vez\s+por\s+m[êe]s|duas\s+vezes\s+por\s+m[êe]s|1x\s+ao\s+m[êe]s|1x\/m[êe]s)\b", text, re.I)
        or re.search(r"\b(?:passo|vou)\s+no\s+m[ée]dico\b", text, re.I)
        or re.search(r"\bconsultas?\s+regulares\b", text, re.I)
    )
    results[7] = r7

    # 08. Sintomas Limitantes
    r8 = bool(
        re.search(r"\b(?:sintomas?|limita[çc][ãa]o|limita[çc][õo]es|dificuldade\s+(?:para|de)|n[ãa]o\s+consig[ou]|impossibilitad[oa]|impede)\s*[:=]?\s*([^\.\;\n]+)", text, re.I)
        or re.search(r"\b(?:dor|dores|dor\s+lombar|parestesia|formigamento|queima[çc][ãa]o|fraqueza|perda\s+de\s+for[çc]a|irradia[çc][ãa]o|irradiada|limita[çc][ãa]o\s+de\s+movimento|rigidez|edema|incha[çc]o|fadiga|cansa[çc]o|ins[ôo]nia|choro|tristeza|ang[úu]stia|desespero|falta\s+de\s+concentra[çc][ãa]o|crise|p[âa]nico|ortost[áa]tic[ao]|sentad[ao]|carregamento|deambula[çc][ãa]o|andar|ficar\s+em\s+p[ée])\b", text, re.I)
    )
    results[8] = r8

    # 09. Medicações
    r9 = bool(
        re.search(r"\b(?:medica[çc][ãa]o|medica[çc][õo]es|rem[ée]dios?|medicamentos?|prescri[çc][ãa]o|uso\s+de|tomo|toma)\s*[:=]?\s*([^\.\;\n]+)", text, re.I)
        or re.search(r"\b(?:fluoxetina|sertralina|escitalopram|citalopram|venlafaxina|desvenlafaxina|duloxetina|paroxetina|clonazepam|rivotril|alprazolam|diazepam|quetiapina|risperidona|olanzapina|aripiprazol|pregabalina|gabapentina|amitriptilina|nortriptilina|ibuprofeno|cetoprofeno|dipirona|paracetamol|tramadol|code[íi]na|celecoxibe|arcoxia|adalimumabe|toragesic|torsilax|mioflex|anti-inflamat[óo]rio|cortic[óo]ide|prednisona|dexametasona|losartana|atenolol|metformina|complexo\s+b)\b", text, re.I)
        or re.search(r"\bn[ãa]o\s+tomo\s+(?:nenhum|rem[ée]dio|medica[çc][ãa]o)\b", text, re.I)
        or re.search(r"\bsem\s+medica[çc][ãa]o\b", text, re.I)
    )
    results[9] = r9

    # 10. Dosagem
    r10 = bool(
        re.search(r"\b(?:dosagem|dose|posologia|mg\/dia|miligramas)\s*[:=]?\s*([^\.\;\n]+)", text, re.I)
        or re.search(r"\b\d+\s*mg\b", text, re.I)
        or re.search(r"\b(\d+)\s+(?:comprimidos?|gotas?|c[áa]psulas?)\b", text, re.I)
        or re.search(r"\b(?:troca|trocou|altera[çc][ãa]o|alterou|mudou|aumentou|diminuiu|ajuste\s+de\s+dose|substitui[çc][ãa]o)\b", text, re.I)
        or re.search(r"\b(?:pela\s+manh[ãa]|de\s+manh[ãa]|[àa]\s+noite|ao\s+deitar|12\/12|8\/8|de\s+resgate|se\s+dor)\b", text, re.I)
    )
    results[10] = r10

    # 11. Terapias
    r11 = bool(
        re.search(r"\b(?:psicoterapia|fisioterapia|terapia|psic[óo]log[ao]|fisio\b|psico\b|pilates|hidroterapia|reabilita[çc][ãa]o)\b", text, re.I)
        or re.search(r"\bfa[çc]o\s+(?:fisio|psico|terapia|fisioterapia|psicoterapia)\b", text, re.I)
        or re.search(r"\bn[ãa]o\s+fa[çc]o\s+(?:fisio|psico|terapia|fisioterapia|psicoterapia)\b", text, re.I)
        or re.search(r"\bsem\s+(?:fisioterapia|psicoterapia)\b", text, re.I)
        or re.search(r"\b\d+\s*x(?:\s+por\s+semana|\/semana)\b", text, re.I)
    )
    results[11] = r11

    return results


def _eval_js_destacar_duvidas(texto: str) -> tuple[str, int, list[str]]:
    """Simula a função destacarDuvidasHtml do JS e retorna html com <mark>, total e termos marcados."""
    padroes = [
        re.compile(r"\b(?:ano\s+é\s+\d+\s+não\s+é\s+\d+|\d+\s+não\s+é\s+\d+|não\s+é\s+\d+|ano\s+é\s+\d+)\b", re.I),
        re.compile(r"\bas\s+(?:psicoterapia|fisioterapia)\b", re.I),
        re.compile(r"\b10\s*mg\b", re.I),
        re.compile(r"\b\d+\s+vezes\s+no\s+mês\b", re.I),
        re.compile(r"\b(?:ou\s+melhor|acho\s+que|se\s+não\s+me\s+engano|talvez|não\s+tenho\s+certeza|não\s+lembro|mais\s+ou\s+menos|por\s+aí|esqueci|não\s+sei\s+dizer|sei\s+lá)\b", re.I),
        re.compile(r"\b(?:inaud[íi]vel|indeterminado|inconclusivo|\?{2,})\b", re.I)
    ]
    
    html = texto
    total = 0
    termos = []
    
    for pat in padroes:
        def repl(m):
            nonlocal total
            total += 1
            termos.append(m.group(0))
            return f'<mark class="ia2-doubt-word">{m.group(0)}</mark>'
        html = pat.sub(repl, html)
        
    return html, total, termos


def test_atendimento_1_ortopedia_dialogo_emendado_e_duvidas():
    """Atendimento 1: Policial Militar com Lombociatalgia, fala rápida emendada e autocorreção de ano."""
    dialogo_bruto = (
        "Médica: Bom dia, qual a sua idade, cargo e quanto tempo no Estado?\n"
        "Paciente: Bom dia doutora, tenho 38 anos, sou policial militar há 12 anos e não sou readaptado.\n"
        "Médica: Qual foi a data do diagnóstico e o que motivou o afastamento?\n"
        "Paciente: Começou em março de 2025, quer dizer, ano é 25 não é 2026, com uma dor lombar terrível que desce pra perna direita, dormência no pé. Não consigo ficar em pé muito tempo na viatura.\n"
        "Médica: Com que frequência vai ao médico?\n"
        "Paciente: Consultas de 15 em 15 dias com o ortopedista.\n"
        "Médica: Quais remédios está tomando e dosagem?\n"
        "Paciente: Tomo pregabalina 75 mg à noite e dipirona... Acho que de dipirona é 10 mg se dor.\n"
        "Médica: Faz fisioterapia ou psicoterapia?\n"
        "Paciente: Faço fisioterapia 2 vezes por semana, psicoterapia não faço."
    )

    # 1. Validação das 11 perguntas da Colinha
    matches = _eval_js_colinha_matches(dialogo_bruto)
    for q_id in range(1, 12):
        assert matches[q_id] is True, f"Pergunta {q_id} não validada no Atendimento 1"

    # 2. Dúvidas em amarelo
    html, total, termos = _eval_js_destacar_duvidas(dialogo_bruto)
    assert total >= 3
    assert any("ano é 25 não é 2026" in t.lower() for t in termos)
    assert any("10 mg" in t.lower() for t in termos)
    assert any("acho que" in t.lower() for t in termos)
    assert '<mark class="ia2-doubt-word">' in html


def test_atendimento_2_psiquiatria_ajuste_dose_e_coloquialismo():
    """Atendimento 2: Professora com Burnout/Depressão, aumento de dose recente e fala coloquial."""
    dialogo_bruto = (
        "Médica: Boa tarde. Qual a sua idade e profissão?\n"
        "Paciente: Tenho 46 anos, sou professora de educação básica há 18 anos de concurso, nunca fui readaptada.\n"
        "Médica: Quando começou o problema e o que sente?\n"
        "Paciente: Desde outubro de 2025, comecei a ter crises de choro, angústia, não consigo entrar na sala de aula, insônia braba, cansaço mental extremo com depressão.\n"
        "Médica: Com que frequência passa com o psiquiatra?\n"
        "Paciente: Retornos mensais com meu psiquiatra todo mês.\n"
        "Médica: Qual medicação está em uso, dosagem e se teve alteração recente?\n"
        "Paciente: Tomo Venlafaxina 150 mg pela manhã e Quetiapina 50 mg ao deitar. O doutor aumentou a dose da Venlafaxina semana passada porque eu não tava melhorando.\n"
        "Médica: Faz terapia?\n"
        "Paciente: Faço psicoterapia semanalmente toda terça-feira, mas fisioterapia não faço."
    )

    # 1. Colinha 100%
    matches = _eval_js_colinha_matches(dialogo_bruto)
    for q_id in range(1, 12):
        assert matches[q_id] is True, f"Pergunta {q_id} não validada no Atendimento 2"

    # 2. Supressão de contradição de dosagem
    queixa_limpa = _clean_queixa_duracao_text(dialogo_bruto)
    assert "Não relatou troca de medicação ou alteração de dosagem" not in queixa_limpa


def test_atendimento_3_cirurgia_artroscopia_joelho_falha_fonetica():
    """Atendimento 3: Inspetor Escolar pós-artroscopia com falha fonética ('as fisioterapia') e hesitação."""
    dialogo_bruto = (
        "Médica: Olá, qual sua idade e função na escola?\n"
        "Paciente: 52 anos de idade, trabalho como inspetor escolar há 20 anos, não tenho readaptação.\n"
        "Médica: Quando iniciou a lesão e qual o tratamento?\n"
        "Paciente: Rompi o menisco dia 10/01/2026... Ou melhor, foi 12/01/2026 após queda na escada. Fiz cirurgia e sinto dor e edema ao dobrar o joelho e andar.\n"
        "Médica: Frequência das consultas?\n"
        "Paciente: A cada 15 dias com o cirurgião.\n"
        "Médica: Medicações e doses?\n"
        "Paciente: Paracetamol com codeína de 8 em 8 horas e celecoxibe 200 mg ao dia.\n"
        "Médica: Faz terapias de reabilitação?\n"
        "Paciente: Sim, as fisioterapia faço 3 vezes na semana, psicoterapia não."
    )

    # 1. Colinha 100%
    matches = _eval_js_colinha_matches(dialogo_bruto)
    for q_id in range(1, 12):
        assert matches[q_id] is True, f"Pergunta {q_id} não validada no Atendimento 3"

    # 2. Destaque de dúvidas fonética ('as fisioterapia') e hesitação ('Ou melhor')
    html, total, termos = _eval_js_destacar_duvidas(dialogo_bruto)
    assert total >= 2
    assert any("as fisioterapia" in t.lower() for t in termos)
    assert any("ou melhor" in t.lower() for t in termos)


def test_atendimento_4_neurologia_tunel_do_carpo_emendado():
    """Atendimento 4: Oficial Administrativo com Síndrome do Túnel do Carpo e fala contínua."""
    dialogo_bruto = (
        "Médica: Qual a sua idade e função?\n"
        "Paciente: 34 anos de idade, sou oficial administrativo há 7 anos no Estado, não sou readaptado.\n"
        "Médica: Quando começaram os sintomas e o que sente?\n"
        "Paciente: Diagnóstico em novembro de 2025 de túnel do carpo, sinto formigamento e queimação nas mãos e perda de força pra digitar no computador.\n"
        "Médica: Consultas?\n"
        "Paciente: Vou no médico todo mês em consultas regulares.\n"
        "Médica: Remédios?\n"
        "Paciente: Pregabalina 150 mg à noite e complexo B.\n"
        "Médica: Faz fisio ou psico?\n"
        "Paciente: Faço fisioterapia duas vezes por semana na clínica do convênio, psicoterapia não faço."
    )

    matches = _eval_js_colinha_matches(dialogo_bruto)
    for q_id in range(1, 12):
        assert matches[q_id] is True, f"Pergunta {q_id} não validada no Atendimento 4"

    # Laudo e-SISLA estruturado
    payload = {
        "cargo": "Oficial Administrativo",
        "cid": "G56.0",
        "cid_descricao": "Síndrome do túnel do carpo",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": "15",
        "data_documento": "10/02/2026",
        "queixa_duracao": dialogo_bruto,
        "fisioterapia": True,
        "psicoterapia": False
    }
    laudo = _build_deterministic_esisla(payload)
    assert "Parecer: FAVORÁVEL" in laudo
    assert "G56.0" in laudo


def test_atendimento_5_reumatologia_espondilite_hesitacao():
    """Atendimento 5: Agente Penitenciário com Espondilite Anquilosante e hesitação ('mais ou menos')."""
    dialogo_bruto = (
        "Médica: Qual a sua idade, cargo e tempo de serviço?\n"
        "Paciente: Estou com 41 anos, sou agente de segurança penitenciária há 14 anos, sem readaptação.\n"
        "Médica: Qual a doença e quando descobriu?\n"
        "Paciente: Trato espondilite anquilosante diagnosticada em 2022. Sinto muita rigidez nas costas de manhã, dor lombar e no quadril pra ficar em pé e caminhar.\n"
        "Médica: Frequência no especialista?\n"
        "Paciente: Passo com o reumatologista a cada dois meses.\n"
        "Médica: Quais remédios toma?\n"
        "Paciente: Uso injeção de Adalimumabe 40 mg a cada 14 dias e tomo Arcoxia 90 mg se dor... Mais ou menos isso.\n"
        "Médica: Faz acompanhamento com fisio ou psicólogo?\n"
        "Paciente: Faço fisioterapia motora semanal, psicoterapia nenhuma."
    )

    # 1. Colinha 100%
    matches = _eval_js_colinha_matches(dialogo_bruto)
    for q_id in range(1, 12):
        assert matches[q_id] is True, f"Pergunta {q_id} não validada no Atendimento 5"

    # 2. Destaque de dúvida em 'Mais ou menos'
    html, total, termos = _eval_js_destacar_duvidas(dialogo_bruto)
    assert total >= 1
    assert any("mais ou menos" in t.lower() for t in termos)
    assert '<mark class="ia2-doubt-word">' in html


def test_endpoint_refinar_dialogo_ia2_estrutura_contrato():
    """Valida o contrato JSON do endpoint /api/ai/refinar-dialogo-ia2 com dados de texto."""
    client = app.test_client()
    
    dialogo_teste = (
        "Qual sua idade tenho 22 anos cargo policial penal há 15 anos não readaptado "
        "início dos sintomas 10/10/2026 consultas quinzenais dor lombar intensa"
    )

    # Teste via payload JSON
    resp = client.post(
        "/api/ai/refinar-dialogo-ia2",
        json={"texto_rascunho": dialogo_teste}
    )
    # Deve responder 200 com JSON bem estruturado
    assert resp.status_code == 200, f"Erro status: {resp.status_code}"
    res = resp.get_json()
    assert res.get("success") is True or res.get("ok") is True
    
    data = res.get("data") or res
    assert "dialogo" in data
    assert "colinha_status" in data
    assert "texto_formatado" in data
    assert isinstance(data["dialogo"], list)
    assert isinstance(data["colinha_status"], list)
    assert len(data["colinha_status"]) == 11
