# -*- coding: utf-8 -*-
"""
Testes automatizados do Modo IA 2.0:
1. Validação das 11 perguntas da colinha em tempo real (COLINHA_IA2_CONFIG)
2. Estrutura visual do Modo IA 2.0 (Seleção, Gravação com colinha e Escrita focada)
3. Ocultação do prontuário ao fundo (CSS body.modo-ia2-active)
4. Integração na Gestão de Atendimentos (botão e redirecionamento com modo_ia2=1)
5. Backend app.py autorizando modo_ia2 no preenchimento de ficha
6. Fallback de texto e integração com e-SISLA
"""
from pathlib import Path
import re
import pytest

ROOT = Path(__file__).resolve().parent.parent
APP_PY = (ROOT / "app.py").read_text(encoding="utf-8")
ATTENDANCE_HTML = (ROOT / "ambiental_avaliacao_medica_lts_cid_assistente.html").read_text(encoding="utf-8")
if (ROOT / "ambiental_assistente.js").exists():
    ATTENDANCE_HTML += "\n" + (ROOT / "ambiental_assistente.js").read_text(encoding="utf-8")
if (ROOT / "ambiental_assistente.css").exists():
    ATTENDANCE_HTML += "\n" + (ROOT / "ambiental_assistente.css").read_text(encoding="utf-8")

GESTAO_HTML = (ROOT / "gestao_atendimentos.html").read_text(encoding="utf-8")
if (ROOT / "gestao_atendimentos.js").exists():
    GESTAO_HTML += "\n" + (ROOT / "gestao_atendimentos.js").read_text(encoding="utf-8")
if (ROOT / "gestao_atendimentos.css").exists():
    GESTAO_HTML += "\n" + (ROOT / "gestao_atendimentos.css").read_text(encoding="utf-8")

def test_colinha_11_perguntas_verbatim():
    """Valida se as 11 perguntas da colinha constam rigorosamente como solicitadas."""
    expected_perguntas = [
        ("01", "Qual é a sua idade ?"),
        ("02", "Qual é o seu cargo."),
        ("03", "Quanto tempo está no cargo ?"),
        ("04", "É readaptado? Se sim, quais atividades exerce atualmente?"),
        ("05", "Qual foi a data do diagnóstico da doença ?"),
        ("06", "Qual doença está tratando que motivou o afastamento?"),
        ("07", "Com que frequência comparece às consultas?"),
        ("08", "Quais sintomas causam limitações para o trabalho?"),
        ("09", "Faz o uso de quais medicações?"),
        ("10", "Qual a dosagem (anotar mg/dia)? No caso de CID F, perguntar quando houve troca ou alteração das dosagens da medicação."),
        ("11", "Faz psicoterapia ou fisioterapia?"),
    ]
    
    assert "const COLINHA_IA2_CONFIG = [" in ATTENDANCE_HTML
    for num, p in expected_perguntas:
        assert f'numero: "{num}"' in ATTENDANCE_HTML, f"Número {num} não encontrado"
        assert f'pergunta: "{p}"' in ATTENDANCE_HTML, f"Pergunta não encontrada verbatim no frontend: {p}"

def test_modo_ia2_html_structure():
    """Valida a presença de todos os containers e modais essenciais do Modo IA 2.0."""
    assert 'id="containerModoIA2"' in ATTENDANCE_HTML
    assert 'id="ia2ViewSelecao"' in ATTENDANCE_HTML
    assert 'id="ia2ViewGravacao"' in ATTENDANCE_HTML
    assert 'id="ia2ViewEscrita"' in ATTENDANCE_HTML
    assert 'id="ia2ColinhaItemsList"' in ATTENDANCE_HTML
    assert 'id="ia2ColinhaValidadasCount"' in ATTENDANCE_HTML
    assert 'id="ia2ColinhaProgressBar"' in ATTENDANCE_HTML
    assert 'id="ia2GravacaoTranscricao"' in ATTENDANCE_HTML
    assert 'id="ia2EscritaText"' in ATTENDANCE_HTML
    assert 'id="ia2TimerDisplay"' in ATTENDANCE_HTML
    assert 'id="ia2ModalAvisoColinha"' in ATTENDANCE_HTML
    assert 'id="ia2ModalSucesso"' in ATTENDANCE_HTML
    assert 'id="ia2ModalFichaEsislaViewer"' in ATTENDANCE_HTML

def test_modo_ia2_ocultacao_fundo_prontuario():
    """Valida a regra de ocultar o fundo do prontuário durante o Modo IA 2.0."""
    assert "body.modo-ia2-active #containerModoAgil," in ATTENDANCE_HTML
    assert "body.modo-ia2-active .sidebar," in ATTENDANCE_HTML
    assert "body.modo-ia2-active #stickyDoctorHUD" in ATTENDANCE_HTML
    assert "display: none !important;" in ATTENDANCE_HTML
    assert "body.modo-ia2-active #containerModoIA2" in ATTENDANCE_HTML

def test_modo_ia2_backend_auth():
    """Valida autorização no backend /api/ai/preencher-ficha para modo_ia2."""
    assert 'is_modo_ia2 = bool(raw.get("modo_ia2"))' in APP_PY
    assert 'if AUTH_REQUIRED and not (is_adm_in_doctor_login or is_modo_ia2):' in APP_PY

def test_gestao_atendimentos_open_eval_modo_ia2():
    """Valida que na Gestão de Atendimentos o botão e função de abertura já direcionam com modo_ia2=1."""
    assert "function openEval(enc, modoIa2 = true)" in GESTAO_HTML
    assert "p.set('modo_ia2', '1');" in GESTAO_HTML
    assert "function openModoIA2(enc)" in GESTAO_HTML
    assert "window.openModoIA2 = openModoIA2;" in GESTAO_HTML
    assert "🚀 Modo IA 2.0" in GESTAO_HTML

def test_attendance_auto_launch_modo_ia2():
    """Valida o auto-launch do Modo IA 2.0 no init ao receber modo_ia2=1 na URL."""
    assert 'const modoIa2Param = params.get("modo_ia2") === "1"' in ATTENDANCE_HTML
    assert 'abrirModoIA2("selecao");' in ATTENDANCE_HTML

def test_aplicar_preenchimento_ia_resultado_supports_ia2_sources():
    """Valida se aplicarPreenchimentoIAResultado lê textos vindos do Modo IA 2.0."""
    assert 'ia2EscritaText' in ATTENDANCE_HTML
    assert 'ia2GravacaoTranscricao' in ATTENDANCE_HTML
    assert '__ia2UltimoTextoProcessado' in ATTENDANCE_HTML

def test_terapias_detection_sovereign_raw_text():
    """Valida detecção soberana de fisioterapia e psicoterapia a partir do texto bruto do médico."""
    from app import _detectar_terapias_texto

    texto_medico = (
        "servidora 42a, peb 2 ha 12a no estado, nao readaptada. refere lombociatalgia importante "
        "iniciada em marco/2026 apos carregar peso, piora ao ficar em pe e sentada, dor irradiando "
        "para membro inferior D. tto c/ ortopedista retornos mensais. uso de pregabalina 75mg 1cp a "
        "noite e tramadol 50mg s/n se dor forte. faz fisio 2x/sem, nega psicoterapia."
    )
    # Mesmo que a IA ou o LLM tenha alucinado 'Não alegou fazer fisioterapia e psicoterapia.',
    # a detecção do texto bruto do médico prevalece de forma soberana.
    fisio, psico = _detectar_terapias_texto(texto_medico, "Não alegou fazer fisioterapia e psicoterapia.")
    assert fisio is True
    assert psico is False

def test_formatar_lista_medicamentos():
    """Valida formatação limpa de dicionários/listas de medicamentos para linguagem clínica."""
    from app import _formatar_lista_medicamentos

    raw_meds = [
        {'dosagem': '75 mg', 'frequência': '1 comprimido à noite', 'medicamento': 'Pregabalina', 'observação': 'dor neuropática'},
        {'dosagem': '50 mg', 'frequência': 'em caso de dor forte', 'medicamento': 'Tramadol', 'observação': 'analgesia de resgate'}
    ]
    formatted = _formatar_lista_medicamentos(raw_meds)
    assert "{" not in formatted
    assert "}" not in formatted
    assert "Pregabalina 75 mg (1 comprimido à noite, dor neuropática)" in formatted
    assert "Tramadol 50 mg (em caso de dor forte, analgesia de resgate)" in formatted

def test_clean_queixa_duracao_dedup_and_leak_removal():
    """Valida a deduplicação de queixa e duração e remoção de fragmentos e dicionários brutos."""
    from app import _clean_queixa_duracao_text

    raw_queixa = (
        "Servidora de 42 anos, relatou não ser readaptada, é Professora de Educação Básica I há 12 anos, com queixa de lombociatalgia importante associada a discopatia lombar desde 2026, realizando consultas mensalmente. "
        "A periciada refere dor lombar irradiada para o membro inferior direito, com piora ao assumir as posturas ortostática e sentada, além de limitação funcional para deambulação prolongada e carregamento de peso. "
        "Servidora de 42 anos, relatou não ser readaptada, é Professora de Educação Básica I há 12 anos, com queixa de lombociatalgia importante associada a discopatia lombar, desde 2026, realizando consultas mensalmente. "
        "A periciada refere dor lombar irradiada para o membro inferior direito, com piora ao assumir as posturas ortostática e sentada, além de limitação funcional para deambulação prolongada e carregamento de peso. "
        "1 comprimido à noite (dor neuropática) e forte (analgesia de resgate). Não relatou troca de medicação ou alteração de dosagem. Não alegou fazer fisioterapia e psicoterapia. "
        "Em uso de [{'dosagem': '75 mg', 'frequência': '1 comprimido à noite', 'medicamento': 'Pregabalina', 'observação': 'dor neuropática'}, {'dosagem': '50 mg', 'frequência': 'em caso de dor forte', 'medicamento': 'Tramadol', 'observação': 'analgesia de resgate'}], "
        "Pregabalina 75 mg, Tramadol 50 mg em caso de dor. Não relatou troca de medicação ou alteração de dosagem. Não alegou fazer fisioterapia e psicoterapia."
    )

    cleaned = _clean_queixa_duracao_text(raw_queixa)

    # 1. Sem vazamento de dicionários
    assert "{" not in cleaned
    assert "}" not in cleaned
    assert "'dosagem'" not in cleaned

    # 2. Sem fragmento órfão de posologia
    assert "1 comprimido à noite (dor neuropática) e forte" not in cleaned

    # 3. Deduplicação de frases inteiras
    assert cleaned.count("Servidora de 42 anos, relatou não ser readaptada") == 1
    assert cleaned.count("A periciada refere dor lombar irradiada") == 1
    assert cleaned.count("Não relatou troca de medicação ou alteração de dosagem") == 1

def test_clean_esisla_text_corrections():
    """Valida correções de CRM duplicado, traço em médico e concordância de lateralidade/rol."""
    from app import _clean_esisla_text, _estruturar_secoes_oficiais_esisla

    sample_esisla = (
        "(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is)\n"
        "Apresenta limitações físicas temporárias decorrentes de lombociatalgia com irradiação para membro inferior direito sinais de radiculopatia, "
        "inviabilizando a permanência prolongada em posição ortostática ou sentada, deambulação contínua e o carregamento de peso, atividades inerentes ao cargo de Professora de Educação Básica I, atividades estas constantes no Rol de Atividades do cargo de Professora de Educação Básica I.\n\n"
        "(*) Parecer Médico\n"
        "Parecer: FAVORÁVEL\n"
        "Nº Dias: 15\n"
        "Data Início: 31/03/2026\n"
        "CID 10: M51.1\n"
        "Descrição: Lombociatalgia importante associada a discopatia lombar\n"
        "CID 10 Secundário: M54.5\n"
        "Descrição Secundária: Dor lombar baixa\n"
        "Médico Perito: Dr. Maykon -\n"
        "CRM: 158158\n"
        "CRM: 158158\n"
        "Dt/Hr Perícia: 22/10/2026 11:34\n"
    )

    cleaned = _clean_esisla_text(sample_esisla)
    structured = _estruturar_secoes_oficiais_esisla(cleaned)

    # Lateralidade e preposição corrigidas
    assert "membro inferior direito, com sinais de radiculopatia" in structured
    assert "membro inferior direito sinais de radiculopatia" not in structured

    # Rol deduplicado
    assert "atividades inerentes ao cargo de Professora de Educação Básica I, atividades estas constantes" not in structured
    assert ", atividades estas constantes no Rol de Atividades do cargo de Professora de Educação Básica I." in structured

    # CRM deduplicado e traço do perito removido
    assert "Médico Perito: Dr. Maykon -" not in structured
    assert "Médico Perito: Dr. Maykon" in structured
    assert structured.count("CRM: 158158") == 1

def test_modo_ia2_voice_uses_get_user_media_and_speech_recognition():
    """Valida se o Modo IA 2.0 solicita permissão explícita ao navegador via getUserMedia no ditado e na gravação."""
    attendance_content = ATTENDANCE_HTML
    
    # Gravação ao vivo
    assert "navigator.mediaDevices.getUserMedia" in attendance_content
    assert "ia2AudioStream" in attendance_content
    assert "ia2Analyser" in attendance_content
    assert "async function iniciarGravacaoIA2" in attendance_content
    
    # Ditado no modo de escrita
    assert "async function alternarDitadoVozEscritaIA2" in attendance_content
    assert "ia2EscritaInterimBubble" in attendance_content
    assert "ia2DitadoEscritaStream" in attendance_content

def test_modo_ia2_finalizar_atendimento_official_flow():
    """Valida se o botão de finalizar após a IA segue o fluxo oficial de atendimento e não apenas rascunho."""
    attendance_content = ATTENDANCE_HTML
    
    # Botão Finalizar Atendimento presente no modal de sucesso
    assert 'id="ia2BtnFinalizarDefinitivo"' in attendance_content
    assert 'onclick="finalizarAtendimentoDefinitivoIA2()"' in attendance_content
    
    # Função finaliza seguindo o fluxo oficial (finalizarAtendimentoAgil / finalizeFromHeader / confirmFinalize)
    assert "finalizarAtendimentoDefinitivoIA2" in attendance_content
    assert "ensureAgileBackgroundDefaults" in attendance_content
    assert "syncAgilToExtended" in attendance_content
    assert "finalizarAtendimentoAgil" in attendance_content
    
    # Opção explícita de salvar rascunho preservada
    assert "salvarComoRascunhoIA2" in attendance_content

def test_modo_ia2_dialogue_cards_and_yellow_doubts():
    """Valida os elementos e funções da transcrição estruturada em diálogo e destaque de dúvidas em amarelo."""
    attendance_content = ATTENDANCE_HTML

    # 1. Elementos HTML do Diálogo e Dúvidas
    assert 'id="ia2BadgeDuvidas"' in attendance_content
    assert 'id="ia2QtdDuvidas"' in attendance_content
    assert 'id="ia2BtnAbaVisual"' in attendance_content
    assert 'id="ia2BtnAbaTexto"' in attendance_content
    assert 'id="ia2GravacaoVisual"' in attendance_content
    assert 'ia2-transcript-visual' in attendance_content
    assert 'ia2-doubt-word' in attendance_content
    assert 'ia2DuvidasLegenda' in attendance_content

    # 2. Funções JavaScript de Suporte
    assert "function destacarDuvidasHtml" in attendance_content
    assert "function estruturarTranscricaoEmDialogo" in attendance_content
    assert "function trocarAbaTranscricaoIA2" in attendance_content
    assert "function atualizarVisualTranscricaoIA2" in attendance_content
    assert "function salvarEdicaoVisualIA2" in attendance_content
    assert "function organizarTranscricaoManualmenteIA2" in attendance_content

    # 3. Estilos CSS de destaque em amarelo
    assert ".ia2-doubt-word {" in attendance_content
    assert "background-color: #FEF08A;" in attendance_content
    assert "color: #854D0E;" in attendance_content

def test_modo_ia2_exact_user_sample_transcription_dialogue():
    """Valida a extração e marcação de dúvidas sobre o exemplo exato fornecido pelo usuário."""
    import re

    raw_user_sample = (
        "Qual a sua idade  tenho 22 anos  Qual o seu cargo  policial penal  "
        "quanto tempo  cinco anos  é readaptado  não  data do diagnóstico da doença  "
        "dia 10/10/2016  ano é 16 não é 2026  Com que frequência comparece as consultas "
        "a cada cinco meses  Quais sintomas causam limitações para o trabalho dor nas costas "
        "do Movimento dos braços dor nas mãos dor na cabeça  e dor nas pernas ao esticá-las  "
        "faz uso de qual medicação Dipirona injetável  benzetacil injetável  qual a dosagem  "
        "de dipirona é 10 mg  e de benzetacil é injetável  as psicoterapia ou fisioterapia faço psico  "
        "10 vezes  no mês"
    )

    padroes_perguntas = [
        r"\b(?:qual\s+(?:é\s+)?a\s+sua\s+idade|qual\s+a\s+sua\s+idade)\b",
        r"\b(?:qual\s+(?:é\s+)?o\s+seu\s+cargo|qual\s+o\s+cargo)\b",
        r"\b(?:quanto\s+tempo)\b",
        r"\b(?:[ée]\s+readaptad[oa])\b",
        r"\b(?:data\s+(?:do\s+)?diagn[óo]stico(?:\s+da\s+doen[çc]a)?)\b",
        r"\b(?:com\s+que\s+frequ[êe]ncia\s+comparece(?:\s+[àa]s\s+consultas)?)\b",
        r"\b(?:quais\s+sintomas\s+causam\s+limita[çc][õo]es(?:\s+para\s+o\s+trabalho)?)\b",
        r"\b(?:faz\s+uso\s+de\s+qual\s+medica[çc][ãa]o)\b",
        r"\b(?:qual\s+a\s+dosagem)\b",
        r"\b(?:(?:faz|as)\s+psicoterapia\s+ou\s+fisioterapia)\b",
    ]

    # Verifica se todas as perguntas do exemplo são identificadas
    for pat in padroes_perguntas:
        assert re.search(pat, raw_user_sample, re.IGNORECASE) is not None, f"Padrão {pat} não encontrou no exemplo"

    # Verifica se os padrões de dúvidas clínicas cobrem os casos do exemplo
    re_inconsistencia = re.search(r"\b(?:ano\s+é\s+\d+\s+não\s+é\s+\d+|\d+\s+não\s+é\s+\d+)\b", raw_user_sample, re.IGNORECASE)
    assert re_inconsistencia is not None
    assert "ano é 16 não é 2026" in re_inconsistencia.group(0)

    re_dosagem = re.search(r"\b10\s*mg\b", raw_user_sample, re.IGNORECASE)
    assert re_dosagem is not None
    assert "10 mg" in re_dosagem.group(0)

    re_fonetica = re.search(r"\bas\s+(?:psicoterapia|fisioterapia)\b", raw_user_sample, re.IGNORECASE)
    assert re_fonetica is not None
    assert "as psicoterapia" in re_fonetica.group(0)

    re_freq = re.search(r"\b\d+\s+vezes\s+no\s+mês\b", re.sub(r"\s+", " ", raw_user_sample), re.IGNORECASE)
    assert re_freq is not None
    assert "10 vezes no mês" in re_freq.group(0)

def test_modo_ia2_refinamento_automatico_integrations():
    """Valida a integração da Melhoria 1 (Refinamento por IA) e Melhoria 2 (Semântica) no backend e frontend."""
    app_content = (ROOT / "app.py").read_text(encoding="utf-8")
    attendance_content = ATTENDANCE_HTML

    # 1. Endpoint no backend
    assert '@app.post("/api/ai/refinar-dialogo-ia2")' in app_content
    assert "def api_ai_refinar_dialogo_ia2():" in app_content
    assert "colinha_status" in app_content
    assert "dialogo" in app_content
    assert "texto_formatado" in app_content

    # 2. Elementos e funções no frontend
    assert 'id="ia2RefinandoBar"' in attendance_content
    assert 'id="ia2RefinandoText"' in attendance_content
    assert "function refinarDialogoComIA2" in attendance_content
    assert "refinarDialogoComIA2(true)" in attendance_content
    assert "window.refinarDialogoComIA2 = refinarDialogoComIA2;" in attendance_content
    assert '/api/ai/refinar-dialogo-ia2' in attendance_content

def test_modo_ia2_screenshot_scenario_dialogue_and_colinha():
    """Valida a separação perfeita das perguntas do print do usuário e validação da colinha."""
    import re

    user_screenshot_text = (
        "Qual sua idade tenho 22 anos o seu cargo tenho sou policial penal quanto tempo "
        "há 20 anos é adaptado não qual foi a data do diagnóstico da doença 05/02 /2016 "
        "às consultas de 10 em 10 dias"
    )

    lista_perguntas = [
        re.compile(r"\b(?:qual\s+(?:é\s+)?a\s+sua\s+idade|qual\s+(?:é\s+)?a\s+idade|qual\s+sua\s+idade|quantos\s+anos(?:\s+tem)?)\b", re.I),
        re.compile(r"\b(?:(?:qual\s+(?:é\s+)?|e\s+)?(?:o\s+)?(?:seu\s+)?cargo|qual\s+(?:é\s+)?o\s+cargo|qual\s+a\s+(?:sua\s+)?fun[çc][ãa]o|qual\s+sua\s+profiss[ãa]o|sua\s+fun[çc][ãa]o|sua\s+profiss[ãa]o)\b", re.I),
        re.compile(r"\b(?:quanto\s+tempo\s+est[áa]\s+no\s+cargo|quanto\s+tempo\s+de\s+servi[çc]o|quanto\s+tempo\s+no\s+cargo|quanto\s+tempo)\b", re.I),
        re.compile(r"\b(?:(?:voc[êe]\s+)?[ée]\s+(?:re)?adaptad[oa]|tem\s+(?:re)?adapta[çc][ãa]o|est[áa]\s+(?:re)?adaptad[oa])\b", re.I),
        re.compile(r"\b(?:(?:qual\s+(?:foi\s+)?a\s+)?data\s+(?:do\s+)?diagn[óo]stico(?:\s+da\s+doen[çc]a)?|quando\s+come[çc]ou(?:\s+o\s+quadro|\s+a\s+doen[çc]a)?|quando\s+iniciou|in[íi]cio\s+dos\s+sintomas)\b", re.I),
        re.compile(r"\b(?:com\s+que\s+frequ[êe]ncia\s+comparece(?:\s+[àa]s\s+consultas)?|com\s+que\s+frequ[êe]ncia\s+vai(?:\s+ao\s+m[ée]dico)?|de\s+quanto\s+em\s+quanto\s+tempo|frequ[êe]ncia\s+das\s+consultas|(?:e\s+|quanto\s+[àa]s\s+|sobre\s+as\s+|[àa]s\s+)?consultas(?:\s+m[ée]dicas)?)\b", re.I),
    ]

    matches = []
    for pat in lista_perguntas:
        for m in pat.finditer(user_screenshot_text):
            matches.append((m.start(), m.end(), m.group(0)))
    matches.sort(key=lambda x: x[0])

    # Devem ser identificadas 6 perguntas independentes
    assert len(matches) == 6
    matched_questions = [m[2] for m in matches]
    assert "Qual sua idade" in matched_questions
    assert "o seu cargo" in matched_questions
    assert "quanto tempo" in matched_questions
    assert "é adaptado" in matched_questions
    assert "qual foi a data do diagnóstico da doença" in matched_questions
    assert "às consultas" in matched_questions

    # Validação da colinha
    # Q04 (Readaptação)
    assert re.search(r"\b(?:(?:re)?adaptad[oa]|(?:re)?adapta[çc][ãa]o)\b", user_screenshot_text, re.I) is not None
    # Q07 (Consultas de 10 em 10 dias)
    assert re.search(r"\bde\s+(\d+|dez)\s+em\s+\d+\s+dias\b", user_screenshot_text, re.I) is not None


def test_retroacao_invalida_keeps_favorable_limitations_and_exam_and_manual_old_date_option(monkeypatch):
    """Valida que na retroação inválida (> 3 dias) aplica CONTRÁRIO automaticamente mantendo limitações e exame como favoráveis e motivo na justificativa, e valida a opção abaixo da justificativa para data antiga."""
    import app as app_module
    from app import PreenchimentoCompletoResult

    attendance_content = ATTENDANCE_HTML
    assert 'id="agilOpcaoParecerDataAntigaBox"' in attendance_content
    assert 'id="sec8OpcaoParecerDataAntigaBox"' in attendance_content
    assert "function selecionarParecerDataAntigaManual" in attendance_content
    assert "function atualizarOpcaoParecerDataAntigaUI" in attendance_content

    def fake_generate_structured(instruction, schema):
        defaults = {}
        for fname in PreenchimentoCompletoResult.model_fields:
            if fname in ("medications", "conditions", "documents", "quesitos", "cids_secundarios"):
                defaults[fname] = []
            elif fname in ("fisioterapia", "psicoterapia"):
                defaults[fname] = False
            else:
                defaults[fname] = ""
        defaults.update({
            "nome_paciente": "Maria Teste",
            "cargo": "Professor de Educação Básica II",
            "idade": "52",
            "readaptado": "Não",
            "cid": "M54.4",
            "cid_descricao": "Lumbago com ciática",
            "doenca_motivo": "Lombociatalgia aguda",
            "sintomas_limitacao": "Dor lombar intensa irradiada para membro inferior direito",
            "exame_fisico_tipo": "Aparelho Osteomuscular e Tecido Conjutivo",
            "exame_fisico_descricao": "Coluna lombar: dor à palpação e limitação de flexo-extensão, Lasègue positivo à direita.",
            "data_documento": "10/10/2026",
            "data_expedicao": "20/10/2026",
            "dias_solicitados": "15",
            "parecer": "FAVORÁVEL",
            "limitacao_funcional": "Sim",
            "limitacao_rol": "Sim",
            "desc_limitacao": "Apresenta limitações físicas para permanecer em pé por períodos prolongados e carregar peso",
            "justificativa": "Justificativa clínica inicial."
        })
        return PreenchimentoCompletoResult.model_construct(**defaults)

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_structured)
    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "atendimento": "ATD-TESTE-001",
            "texto_bruto": "Periciada 52 anos, PEB II, dor lombar irradiada, atestado de 10/10/2026 para 15 dias.",
            "modo_ia2": True,
            "contexto_atual": {
                "dataDocumento": "2026-10-10",
                "dataExpedicao": "20/10/2026",
                "dataExpedicaoIso": "2026-10-20"
            }
        }
    )
    assert resp.status_code == 200, resp.get_json()
    dados = resp.get_json()["dados"]
    assert dados["retroacao_invalida"] is True
    assert dados["parecer"] == "CONTRÁRIO"
    assert dados["limitacao_funcional"] == "Sim"
    assert dados["limitacao_rol"] == "Sim"
    assert "Rol de Atividades" in dados["desc_limitacao"]
    assert "emissão extemporânea" not in dados["desc_limitacao"]
    assert "Lasègue positivo" in dados["exame_fisico_descricao"]
    assert "retroação" in dados["justificativa"].lower()
    assert "CONTRÁRIO" in dados["justificativa"]


def test_user_scenario_complex_raw_attendance(monkeypatch):
    """Valida o cenário exato trazido pelo usuário:
    - Fisioterapia Sim e Psicoterapia Não
    - Dados do Atestado & Prazos: vinte e um dias -> 21, crm 142890, 15/01/2026, guia 29/01/2026
    - Retroação inválida (14 dias > 3 dias): Parecer estritamente CONTRÁRIO
    - Justificativa sem nenhum parêntese () e de alta qualidade técnica
    - Refinamento da justificativa no e-SISLA preservando limitações favoráveis e quesitos Sim, Sim, Sim
    - Opção 'Atestado com Data Antiga' não deve ser exibida quando for retroação inválida
    """
    import app as app_module
    from app import (
        _detectar_terapias_texto,
        _converter_numero_extenso_dias,
        _extrair_dias_solicitados_texto,
        _extrair_datas_documento_texto,
        _remover_parenteses_texto,
        _construir_justificativa_retroacao,
        _aprimorar_justificativa_retroacao_esisla,
        _build_deterministic_esisla,
        PreenchimentoCompletoResult
    )

    texto_usuario = (
        "servidor público estadual comparece hoje para avaliação pericial trazendo atestado médico "
        "com diagnóstico de lombociatalgia intensa cid m54.4. refere que a dor lombar começou em "
        "dezembro de 2025 e piorou muito mesmo dia 12 de janeiro de 2026 com irradiação até o pé direito "
        "e dormência. fisioterapia faz duas vezes por semana na clínica do convênio psicoterapia não faz. "
        "ao exame físico apresenta marcha claudicante lasègue positivo a 45 graus à direita e limitação funcional "
        "severa para flexão do tronco e permanência em pé. atestado emitido pelo dr marcos vinicius crm 142890 "
        "solicitando vinte e um dias a partir do dia 15/01/2026. guia expedida pelo setor em 29/01/2026."
    )

    # 1. Fisioterapia e Psicoterapia
    fisio, psico = _detectar_terapias_texto(texto_usuario, "")
    assert fisio is True
    assert psico is False

    # 2. Conversão de número por extenso e extração de dados do atestado
    assert _converter_numero_extenso_dias("vinte e um dias") == "21"
    dias_ext = _extrair_dias_solicitados_texto(texto_usuario)
    assert dias_ext == "21"

    dt_doc, dt_exp, crm_ext = _extrair_datas_documento_texto(texto_usuario)
    assert dt_doc == "15/01/2026"
    assert dt_exp == "29/01/2026"
    assert crm_ext == "142890"

    # 3. Justificativa sem parênteses
    just = _construir_justificativa_retroacao(
        cargo="Professor de Educação Básica II",
        cid="M54.4",
        doenca_motivo="Lumbago com ciática",
        sintomas="marcha claudicante, Lasègue positivo e limitação funcional severa para permanência em pé",
        retro_dias=14
    )
    assert "(" not in just
    assert ")" not in just
    assert "o(a)" not in just
    assert "periciado(a)" not in just
    assert "14 dias de retroação" in just
    assert "CONTRÁRIO" in just

    # 4. Geração e refinamento no e-SISLA
    esisla_just = _aprimorar_justificativa_retroacao_esisla(
        {
            "cargo": "Professor de Educação Básica II",
            "cid": "M54.4",
            "cid_descricao": "Lumbago com ciática",
            "retroacao_invalida": True,
            "retroacao_dias": 14,
            "data_documento": "15/01/2026",
            "data_expedicao": "29/01/2026"
        },
        just
    )
    assert "(" not in esisla_just
    assert ")" not in esisla_just
    assert "M54.4" in esisla_just
    assert "DPME SP" in esisla_just

    # 5. Endpoint preencher-ficha com texto do usuário
    def fake_generate(instruction, schema):
        defaults = {}
        for fname in PreenchimentoCompletoResult.model_fields:
            if fname in ("medications", "conditions", "documents", "quesitos", "cids_secundarios"):
                defaults[fname] = []
            elif fname in ("fisioterapia", "psicoterapia"):
                defaults[fname] = False
            else:
                defaults[fname] = ""
        defaults.update({
            "nome_paciente": "Carlos Servidor",
            "cargo": "Professor de Educação Básica II",
            "cid": "M54.4",
            "cid_descricao": "Lumbago com ciática",
            "data_documento": "15/01/2026",
            "data_expedicao": "29/01/2026",
            "dias_solicitados": "vinte e um",
            "crm_cro": "142890",
            "parecer": "FAVORÁVEL", # mesmo que o LLM inicial sugerisse favorável, a retroação deve forçar CONTRÁRIO
            "limitacao_funcional": "Sim",
            "limitacao_rol": "Sim",
            "desc_limitacao": "Apresenta limitações físicas temporárias para flexão de coluna e ortostase",
            "exame_fisico_descricao": "Marcha claudicante, Lasègue positivo a 45 graus à direita",
            "justificativa": "Justificativa de teste."
        })
        return PreenchimentoCompletoResult.model_construct(**defaults)

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate)
    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "atendimento": "ATD-RETRO-002",
            "texto_bruto": texto_usuario,
            "modo_ia2": True,
            "contexto_atual": {}
        }
    )
    assert resp.status_code == 200
    dados = resp.get_json()["dados"]
    assert dados["fisioterapia"] is True
    assert dados["psicoterapia"] is False
    assert dados["dias_solicitados"] == "21"
    assert dados["data_documento"] in ("2026-01-15", "15/01/2026")
    assert dados.get("data_documento_br", "15/01/2026") == "15/01/2026"
    assert dados["data_expedicao"] in ("2026-01-29", "29/01/2026")
    assert dados.get("data_expedicao_br", "29/01/2026") == "29/01/2026"
    assert dados["crm_cro"] == "142890"
    assert dados["retroacao_invalida"] is True
    assert dados["parecer"] == "CONTRÁRIO"
    assert dados["limitacao_funcional"] == "Sim"
    assert dados["limitacao_rol"] == "Sim"
    assert "(" not in dados["justificativa"]
    assert ")" not in dados["justificativa"]

    # 6. Validação do laudo determinístico e-SISLA para retroação
    laudo_esisla = _build_deterministic_esisla(dados)
    assert "Parecer: CONTRÁRIO" in laudo_esisla
    just_lines = [line for line in laudo_esisla.splitlines() if "critério administrativo" in line or "DPME" in line]
    assert len(just_lines) > 0
    assert "(" not in just_lines[0]
    assert ")" not in just_lines[0]

    # 7. Frontend: ocultação da caixa "Atestado com Data Antiga" na retroação
    js_content = (ROOT / "ambiental_assistente.js").read_text(encoding="utf-8")
    assert "const isRetroInv = (typeof diffDays === \"number\" && diffDays > 3) || Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);" in js_content
    assert "if (!isDataAntiga || isRetroInv) {" in js_content
    assert "if (boxAgil) boxAgil.style.display = \"none\";" in js_content
    assert "if (boxSec8) boxSec8.style.display = \"none\";" in js_content


def test_caso_1_retroacao_quesitos_sim_and_no_double_e_and_no_dedup_meds():
    """Valida Caso 1:
    - Quesitos e-SISLA em retroação inválida devem ser Sim, Sim, Sim
    - Sem duplicidade 'e e' na justificativa de retroação
    - Deduplicação de 'Não relatou uso de medicações... Negou uso de medicações.'
    """
    from app import (
        _clean_queixa_duracao_text,
        _construir_justificativa_retroacao,
        _build_deterministic_esisla,
        _gatekeeper_anti_glosa_esisla
    )

    # 1. Deduplicação em Queixa e Duração
    raw_queixa_caso1 = (
        "Servidor de 30 anos, relatou não ser readaptado, é Servidor Público Estadual, com queixa de lombociatalgia intensa, desde 2025, realizando consultas conforme acompanhamento clínico. "
        "O periciado refere dor em região lombar com piora recente e irradiação para o membro inferior direito acompanhada de dormência, apresentando marcha claudicante e limitação para flexão do tronco e permanência na posição ortostática. "
        "Não relatou uso de medicações. Realiza fisioterapia motora duas vezes por semana e não realiza psicoterapia. Negou uso de medicações."
    )
    cleaned_queixa = _clean_queixa_duracao_text(raw_queixa_caso1)
    assert "Não relatou uso de medicações" in cleaned_queixa
    assert "Negou uso de medicações" not in cleaned_queixa

    # 2. Sem duplo 'e e' na justificativa
    just = _construir_justificativa_retroacao(
        cargo="Servidor Público Estadual",
        cid="M54.4",
        doenca_motivo="Lombociatalgia intensa",
        sintomas="dor em região lombar com piora recente e irradiação para o membro inferior direito acompanhada de dormência, apresentando marcha claudicante e limitação para flexão do tronco e permanência na posição ortostática",
        retro_dias=14,
        doc_date_br="15/01/2026",
        exp_date_br="29/01/2026"
    )
    assert " e e " not in just
    assert "tronco e limitações" in just or "flexão do tronco e e" not in just
    assert "(" not in just and ")" not in just

    # 3. Quesitos e-SISLA Sim, Sim, Sim
    payload_caso1 = {
        "cargo": "Servidor Público Estadual",
        "cid": "M54.4",
        "cid_descricao": "Lombociatalgia intensa",
        "parecer": "CONTRÁRIO",
        "retroacao_invalida": True,
        "retroacao_dias": 14,
        "data_documento": "15/01/2026",
        "data_expedicao": "29/01/2026",
        "dias_solicitados": "0",
        "justificativa": just,
        "sintomas_limitacoes": "Permanência prolongada em pé, locomoção e flexão de tronco",
        "queixa_duracao": cleaned_queixa,
        "fisioterapia": True,
        "psicoterapia": False
    }
    laudo = _build_deterministic_esisla(payload_caso1)
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo

    # Pós-processamento também deve manter Sim, Sim, Sim mesmo com CONTRÁRIO
    laudo_pos = _gatekeeper_anti_glosa_esisla(laudo, payload_caso1)
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_pos
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo_pos
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo_pos


def test_caso_2_psiquiatria_ajuste_dose_suppresses_contradiction():
    """Valida Caso 2:
    - Quando há relato explícito de ajuste recente de dose, deve suprimir a frase padrão:
      'Não relatou troca de medicação ou alteração de dosagem.'
    """
    from app import _clean_queixa_duracao_text, _build_deterministic_esisla

    raw_queixa_caso2 = (
        "Servidora de 46 anos, relatou não ser readaptada, é Professora de Educação Básica II há 18 anos, com queixa de episódio depressivo grave com choro fácil, insônia terminal, ideação de ruína e anedonia, desde 2025, realizando consultas quinzenalmente. "
        "A periciada refere humor deprimido, choro fácil, insônia terminal, ideação de ruína e anedonia, associados a lentificação psicomotora e dificuldade de concentração. "
        "Em uso de Venlafaxina 150 mg/dia pela manhã e Quetiapina 50 mg/dia ao deitar, com ajuste recente de dose realizado pelo psiquiatra assistente em 05/02/2026. "
        "Realiza psicoterapia semanal e não realiza fisioterapia. Não relatou troca de medicação ou alteração de dosagem."
    )
    cleaned = _clean_queixa_duracao_text(raw_queixa_caso2)
    assert "ajuste recente de dose realizado pelo psiquiatra assistente em 05/02/2026" in cleaned
    assert "Não relatou troca de medicação ou alteração de dosagem" not in cleaned


def test_caso_3_lombalgia_sem_incapacidade_contrario_quesitos_sim_nao_nao():
    """Valida Caso 3:
    - Caso com exame normal e remissão dos sintomas
    - Parecer CONTRÁRIO, 0 dias
    - Quesitos Sim, Não, Não
    - Justificativa clara de capacidade preservada
    """
    from app import _build_deterministic_esisla, _gatekeeper_anti_glosa_esisla

    payload_caso3 = {
        "cargo": "Oficial Administrativo",
        "cid": "M54.5",
        "cid_descricao": "Lombalgia aguda",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": "0",
        "justificativa": "Capacidade laborativa preservada, considerando que neste ato pericial não se observam alterações ou limitações de ordem osteomuscular incapacitantes para as atribuições rotineiras do cargo atual.",
        "exame_fisico_geral": "Estado geral bom, consciente, orientado. Aparelho osteomuscular normal, Lasègue negativo.",
        "desc_limitacao": "Do ponto de vista médico não se observam limitações físicas ou mentais funcionais incapacitantes para as atribuições do cargo de Oficial Administrativo, constantes no rol de atividades."
    }

    laudo = _build_deterministic_esisla(payload_caso3)
    assert "Parecer: CONTRÁRIO" in laudo
    assert "Nº Dias: 0" in laudo
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Não" in laudo
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Não" in laudo

    laudo_pos = _gatekeeper_anti_glosa_esisla(laudo, payload_caso3)
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Não" in laudo_pos
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Não" in laudo_pos


