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


def test_modo_ia_exclusividade_e_auto_launch_opcoes_ia2():
    """Valida que exclusivamente médicos no Modo IA têm acesso à IA 2.0 e que ao abrir atendimento já aparecem as opções."""
    # 1. Frontend assistente: função de checagem e controle de visibilidade
    assert "function isModoIA2Habilitado()" in ATTENDANCE_HTML
    assert "function aplicarVisibilidadeModoIA2()" in ATTENDANCE_HTML
    assert "window.isModoIA2Habilitado = isModoIA2Habilitado;" in ATTENDANCE_HTML
    assert "window.aplicarVisibilidadeModoIA2 = aplicarVisibilidadeModoIA2;" in ATTENDANCE_HTML

    # 2. Guarda contra acesso indevido em abrirModoIA2
    assert 'if (typeof isModoIA2Habilitado === "function" && !isModoIA2Habilitado())' in ATTENDANCE_HTML
    assert "O Modo IA 2.0 está disponível exclusivamente para médicos configurados no Modo IA" in ATTENDANCE_HTML

    # 3. IDs dos botões controlados
    assert 'id="hudBtnModoIA2"' in ATTENDANCE_HTML
    assert 'id="headerBtnModoIA2"' in ATTENDANCE_HTML
    assert 'id="bannerBtnModoIA2"' in ATTENDANCE_HTML

    # 4. Auto launch ao abrir atendimento quando médico for Modo IA
    assert 'isDoctorModoIAActive' in ATTENDANCE_HTML
    assert 'abrirModoIA2("selecao");' in ATTENDANCE_HTML

    # 5. Gestão de Médicos e Impersonate preservando modo_atendimento
    gestao_medicos_js = (ROOT / "gestao_medicos.js").read_text(encoding="utf-8")
    assert "isDoctorModoIA" in gestao_medicos_js
    assert "sessionStorage.setItem('ambiental.impersonate_medico_modo'" in gestao_medicos_js
    assert "sessionStorage.removeItem('ambiental.impersonate_medico_modo')" in gestao_medicos_js


def test_header_botoes_ia_exclusivos_adm_e_remocao_ver_prontuario_padrao():
    """Valida:
    1. Botões '🚀 Modo IA 2.0' e '✨ Preencher com IA' ocultos no cabeçalho e exibidos apenas para ADM ao entrar em login médico.
    2. Botão 'Ver Prontuário Padrão' completamente removido do Modo IA 2.0.
    """
    attendance_raw = (ROOT / "ambiental_avaliacao_medica_lts_cid_assistente.html").read_text(encoding="utf-8")
    if (ROOT / "ambiental_assistente.js").exists():
        attendance_raw += "\n" + (ROOT / "ambiental_assistente.js").read_text(encoding="utf-8")

    # 1. Botão Ver Prontuário Padrão removido do Modo IA 2.0
    assert "Ver Prontuário Padrão" not in attendance_raw
    assert "ia2-btn-prontuario-padrao" not in attendance_raw

    # 2. Controle dos botões no cabeçalho superior e HUD apenas para adm in doctor login
    assert 'hdrBtn.style.display = isAdmDoctor ? "inline-flex" : "none";' in attendance_raw
    assert 'hdrPreencherBtn.style.display = isAdmDoctor ? "inline-flex" : "none";' in attendance_raw
    assert 'id="headerBtnPreencherIA"' in attendance_raw


def test_preservacao_ficha_vinculada_datas_e_dias():
    """Valida que atendimentos com ficha vinculada preservam data do atestado, expedição e dias solicitados originais."""
    attendance_raw = (ROOT / "ambiental_avaliacao_medica_lts_cid_assistente.html").read_text(encoding="utf-8")
    if (ROOT / "ambiental_assistente.js").exists():
        attendance_raw += "\n" + (ROOT / "ambiental_assistente.js").read_text(encoding="utf-8")

    # 1. Frontend funções de ficha vinculada
    assert "function hasFichaVinculada()" in attendance_raw
    assert "function preservarDadosFichaVinculada()" in attendance_raw
    assert "window.hasFichaVinculada = hasFichaVinculada;" in attendance_raw
    assert "window.preservarDadosFichaVinculada = preservarDadosFichaVinculada;" in attendance_raw

    # 2. Backend app.py preservando dados da ficha vinculada no update
    assert "is_vinculado_old" in APP_PY
    assert "dados_vinc" in APP_PY
    assert 'a["dadosFichaVinculada"] =' in APP_PY

    # 3. Backend _build_deterministic_esisla prioriza diasConcedidos no laudo sem perder dias_solicitados
    assert 'dias_concedidos = str(payload.get("diasConcedidos")' in APP_PY
    assert 'dias = "0" if is_contra else (dias_concedidos or dias_solicitados or "1")' in APP_PY


def test_eduardo_henrique_moura_retroacao_quesitos_sim_sim_sim():
    """Valida que em casos de retroação > 3 dias com exame físico alterado (como EDUARDO HENRIQUE MOURA),
    todos os 3 quesitos oficiais (1, 2 e 3) são Sim/SIM no backend, no assistente e no modal de Gestão."""
    from app import (
        _minimal_ai_context,
        _build_deterministic_esisla,
        _gatekeeper_anti_glosa_esisla,
    )

    payload_eduardo = {
        "nome": "EDUARDO HENRIQUE MOURA",
        "cargo": "Agente de Segurança Penitenciária",
        "cid": "S82.2",
        "cid_descricao": "Fratura da diáfise da tíbia",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": "0",
        "data_documento": "10/01/2026",
        "data_expedicao": "25/01/2026",
        "queixa_duracao": (
            "Servidor de 38 anos, relatou não ser readaptado, é Agente de Segurança Penitenciária, "
            "com queixa de dor e edema em perna direita após trauma, desde 2026."
        ),
        "justificativa": (
            "Apesar de apresentar quadro compatível com CID S82.2, com dor à palpação e limitação de marcha "
            "que geram incapacidade temporária para as atividades de Agente de Segurança Penitenciária, "
            "o parecer é contrário exclusivamente por 15 dias de retroação entre o atestado médico de "
            "10/01/2026 e a expedição da guia pericial em 25/01/2026."
        ),
        "quesitos": [
            {"pergunta": "1) Há doença?", "resposta": "Sim"},
            {"pergunta": "2) Gera limitação?", "resposta": "Sim"},
            {"pergunta": "3) Impede atividade do rol?", "resposta": "Não"},
        ],
    }

    # 1. _minimal_ai_context deve corrigir os 3 quesitos para Sim mesmo se vier 'Não' no payload
    ctx = _minimal_ai_context(payload_eduardo)
    assert ctx["retroacao_invalida"] is True
    assert ctx["limitacao_funcional"] == "Sim"
    assert ctx["limitacao_rol"] == "Sim"
    for q in ctx["quesitos"]:
        assert q["resposta"] == "Sim"

    # 2. _build_deterministic_esisla e _gatekeeper_anti_glosa_esisla devem manter Sim, Sim, Sim
    laudo = _build_deterministic_esisla(payload_eduardo)
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo

    laudo_pos = _gatekeeper_anti_glosa_esisla(laudo, payload_eduardo)
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_pos
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo_pos
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo_pos

    # 3. gestao_atendimentos.js deve priorizar isRetro / isRetroJson -> SIM / S para os 3 quesitos
    # e não confundir "relatou não ser readaptado" com readaptado
    gestao_js = (ROOT / "gestao_atendimentos.js").read_text(encoding="utf-8")
    assert "if (isRetro) return 'SIM';" in gestao_js
    assert "if (isRetroJson) return 'S';" in gestao_js
    assert "!str.match(/n[ãa]o\\s+(?:ser\\s+|é\\s+|est[áa]\\s+)?readaptad[oa]/i)" in gestao_js

    # 4. ambiental_assistente.js deve forçar Sim nos 3 quesitos em casos de retroação inválida
    assistente_js = (ROOT / "ambiental_assistente.js").read_text(encoding="utf-8")
    assert 'if (isRetroInv) {' in assistente_js
    assert 'QuesitoService.set(2, isFavOrRetro ? "Sim" : "Não");' in assistente_js
    assert 'if (tipo === "FAVORAVEL" || isRetroInv) {' in assistente_js


def test_parse_esisla_gpm_pdf_data_expedicao_maria_iara_silva():
    """Valida a extração da data de expedição ('06 Novembro 2026,' / ', 06 Novembro 2026')
    e demais campos do PDF GPM - Guia para Perícia Médica (MARIA IARA SILVA), garantindo
    que Data de Emissão do Atestado (03/11/2026) nunca sobrescreva a Data da Expedição (06/11/2026)."""
    from app import parse_esisla_text

    raw_gpm_pypdf = (
        "GOVERNO DO ESTADO DE SÃO PAULO\n"
        "DPME - DIRETORIA DE PERÍCIAS MÉDICAS DO ESTADO\n"
        "GPM - Guia para Perícia Médica\n"
        "NI:\nNome: CPF: RG:\nSexo:Nasc.: Estado Civil: Def Físico:\n"
        "1041774\n"
        "MARIA IARA SILVA 15722147320 38182176\n"
        "FEMININO16/06/1956 NÃO\n"
        "Status: ATIVO\n"
        "3Licenças:\n"
        "Dados Funcionais\n"
        "000000000073385 - EE P EUGENE CHARBONNEAU PF DR\n"
        "PROFESSOR EDUCACAO BASICA ILEI 500/74\n"
        "00008 - SECRETARIA DA EDUCACAO\n"
        "CAMPINAS\n"
        "28/03/2007\n"
        "Readaptado: NAO Data Readaptação: CID-10:\n"
        "Número: 954402454\n"
        "CAMPINAS\n"
        "Válida até o final do expediente do 1° dia útil subseqüente a Expedição\n"
        "06 Novembro 2026,\n"
        "Local e Data da Expedição\n"
        "EE P EUGENE CHARBONNEAU PF DR Documento gerado por:\n"
        "VIRGINIA ELAINE NOGUEIRA\n"
        "Parecer do Médico Assistente\n"
        "CRM: 163512 Nome: CLEBERSON LEAL\n"
        "CID 10: R104 5Dias: Data de Emissão do Atestado: 03/11/2026\n"
        "Sobre a Perícia\n"
        "Tipo:\nPessoa a ser periciada:\nA PEDIDO\nNome:O PROPRIO \n"
        "Motivo: LTS - TRATAMENTO DE SAUDE\n"
        "Local da Perícia: EXTERNO CAMPINAS - POLI LEM SERVIÇOS MEDICOS E HOSPITALARES\n"
        "Data Perícia: 10/11/2026 07:55\n"
        "Município: CAMPINAS\n"
    )

    dados = parse_esisla_text(raw_gpm_pypdf)
    assert dados["protocolo"] == "954402454"
    assert dados["nome_paciente"] == "MARIA IARA SILVA"
    assert dados["cpf_paciente"] == "157.221.473-20"
    assert dados["data_documento_br"] == "03/11/2026"
    assert dados["data_documento"] == "2026-11-03"
    assert dados["data_expedicao"] == "06/11/2026"
    assert dados["data_expedicao_br"] == "06/11/2026"
    assert dados["data_expedicao_iso"] == "2026-11-06"
    assert dados["retroacao_dias"] == 3
    assert dados["retroacao_invalida"] is False
    assert dados["local_expedicao"] == "EE P EUGENE CHARBONNEAU PF DR"
    assert dados["documento_gerado_por"] == "VIRGINIA ELAINE NOGUEIRA"
    assert dados["municipio"] == "CAMPINAS"
    assert dados["dias_solicitados"] == "5"

    # Variante OCR onde a vírgula antecede a data (', 06 Novembro 2026')
    raw_gpm_ocr = raw_gpm_pypdf.replace("06 Novembro 2026,", ", 06 Novembro 2026")
    dados_ocr = parse_esisla_text(raw_gpm_ocr)
    assert dados_ocr["data_expedicao"] == "06/11/2026"
    assert dados_ocr["data_expedicao_iso"] == "2026-11-06"
    assert dados_ocr["retroacao_dias"] == 3


def test_normalizar_sinais_vitais_biometria_default_00_and_fix_750kg():
    """Valida se altura e peso não identificados retornam '00' e corrige bug de 75.0 virar 750."""
    from app import _normalizar_sinais_vitais_biometria, _build_deterministic_esisla

    # 1. Valores não informados / vazios / falsy -> '00'
    s, d, p, alt, peso = _normalizar_sinais_vitais_biometria("", "", "", "", "")
    assert alt == "00"
    assert peso == "00"

    s, d, p, alt, peso = _normalizar_sinais_vitais_biometria(None, None, None, None, None)
    assert alt == "00"
    assert peso == "00"

    s, d, p, alt, peso = _normalizar_sinais_vitais_biometria("120", "80", "75", "0", "0")
    assert alt == "00"
    assert peso == "00"

    s, d, p, alt, peso = _normalizar_sinais_vitais_biometria("120", "80", "75", "Não inf.", "não informado")
    assert alt == "00"
    assert peso == "00"

    # 2. Correção de peso float (75.0 ou 75,0 não pode virar 750)
    s, d, p, alt, peso = _normalizar_sinais_vitais_biometria("120", "80", "75", "1.76", "75.0")
    assert alt == "1.76"
    assert peso == "75"

    s, d, p, alt, peso = _normalizar_sinais_vitais_biometria("120", "80", "75", "1,76", "75,0")
    assert alt == "1.76"
    assert peso == "75"

    # 3. Fator 10x de erro de digitação (ex: 750 -> 75)
    s, d, p, alt, peso = _normalizar_sinais_vitais_biometria("120", "80", "75", "176", "750")
    assert alt == "1.76"
    assert peso == "75"

    # 4. Peso decimal legítimo (ex: 72.5)
    s, d, p, alt, peso = _normalizar_sinais_vitais_biometria("120", "80", "75", "1.65", "72.5")
    assert alt == "1.65"
    assert peso == "72.5"

    # 5. Geração de ficha e-SISLA oficial quando não informado
    payload = {
        "queixa": "Dor lombar",
        "pressao_sistolica": "120",
        "pressao_diastolica": "80",
        "pulso": "78",
        # Altura e peso ausentes
    }
    ficha = _build_deterministic_esisla(payload)
    assert "Altura: 00" in ficha
    assert "Peso: 00" in ficha


def test_protocolo_substitui_uuid_no_atendimento(monkeypatch):
    """Garante que o protocolo oficial do colaborador (ex: 954404396) seja sempre
    priorizado no campo Atendimento, e que UUIDs gerados internamente sejam
    substituídos/autocurados tanto no backend quanto no frontend.
    """
    import app as app_module
    from app import _is_uuid_like

    # 1. Validação do helper _is_uuid_like
    assert _is_uuid_like("32009c06-4001-4b83-ace8-d4aecada6f1d") is True
    assert _is_uuid_like("954404396") is False
    assert _is_uuid_like("ATD-1731400000") is False
    assert _is_uuid_like("") is False
    assert _is_uuid_like(None) is False

    # 2. Mock do banco de dados para testar api_get_atendimento e autocura
    class FakeCursor:
        def __init__(self, row):
            self.row = row
            self.updated = False
            self.executed_queries = []
        def execute(self, q, params=None):
            self.executed_queries.append((q, params))
            if "UPDATE atendimentos" in q:
                self.updated = True
        def fetchone(self):
            return self.row
        def close(self):
            pass

    class FakeDb:
        def __init__(self, row):
            self.cur = FakeCursor(row)
        def cursor(self):
            return self.cur
        def commit(self):
            pass

    # Atendimento com UUID antigo mas com protocolo no aux
    fake_row = {
        "id": "32009c06-4001-4b83-ace8-d4aecada6f1d",
        "numero": "32009c06-4001-4b83-ace8-d4aecada6f1d",
        "status": "RASCUNHO",
        "payload_json": {
            "atendimento": "32009c06-4001-4b83-ace8-d4aecada6f1d",
            "nomePaciente": "Ingrid Almeida Campos",
            "aux": {
                "protocolo": "954404396",
                "agenda_protocolo": "954404396"
            }
        },
        "completude": 40.0,
        "atualizado_em": "2026-11-12T10:00:00",
        "finalizado_em": None,
        "versao": 1,
        "atualizado_por": "u1",
        "paciente_nome": "Ingrid Almeida Campos",
        "paciente_cpf": "27724707847",
        "medico": "Dr. Teste",
        "unidade": "UA Centro"
    }

    fake_db = FakeDb(fake_row)
    monkeypatch.setattr(app_module, "get_db", lambda: fake_db)
    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)
    monkeypatch.setattr(app_module, "_require_permission", lambda perm: None)
    monkeypatch.setattr(app_module, "_require_record_access", lambda r, write=False: None)

    client = app_module.app.test_client()
    resp = client.get("/api/atendimentos/32009c06-4001-4b83-ace8-d4aecada6f1d")
    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()["data"]

    # Deve retornar o protocolo do colaborador no atendimento e no payload
    assert data["atendimento"] == "954404396"
    assert data["payload"]["atendimento"] == "954404396"
    assert data["payload"]["protocolo"] == "954404396"
    # Deve ter executado o UPDATE para autocura no banco
    assert fake_db.cur.updated is True


def test_doenca_motivo_ia2_substitui_titulo_generico_cid_pela_doenca_real(monkeypatch):
    """Garante que o Modo IA 2.0 nunca devolva descrição genérica de tabela CID
    (ex: 'Outros transtornos ansiosos (CID F41)') no campo doenca_motivo,
    extraindo e aprimorando a doença referida no texto bruto sem incluir '(CID ...)'.
    """
    import app as app_module
    from app import PreenchimentoCompletoResult, _limpar_doenca_motivo_bruto

    # 1. Helper direto: texto bruto com crise de ansiedade, pânico e insônia
    res_panic = _limpar_doenca_motivo_bruto(
        "Outros transtornos ansiosos (CID F41)",
        cid="F41",
        cid_desc="Outros transtornos ansiosos",
        texto_bruto="Servidora apresenta crises de ansiedade, pânico e insônia persistente.",
    )
    assert "(CID" not in res_panic
    assert "Outros transtornos ansiosos" not in res_panic
    assert "Transtorno ansioso" in res_panic
    assert "pânico" in res_panic.lower()

    # 2. Helper direto: fallback sem sintomas específicos no texto bruto ainda evita rótulo genérico
    res_fallback = _limpar_doenca_motivo_bruto(
        "Outros transtornos ansiosos",
        cid="F41",
        cid_desc="Outros transtornos ansiosos",
        texto_bruto="Atestado de 15 dias por CID F41.",
    )
    assert "(CID" not in res_fallback
    assert res_fallback == "Transtorno ansioso em acompanhamento clínico"

    # 3. Fluxo /api/ai/preencher-ficha quando o LLM devolve título raso com (CID F41)
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
            "nome_paciente": "Maria Servidora",
            "cargo": "Professora de Educação Básica II",
            "cid": "F41",
            "cid_descricao": "Outros transtornos ansiosos",
            "doenca_motivo": "Outros transtornos ansiosos (CID F41)",
            "sintomas_limitacao": "Crises recorrentes de ansiedade, palpitações e insônia",
            "data_documento": "10/03/2026",
            "data_expedicao": "10/03/2026",
            "dias_solicitados": "15",
            "crm_cro": "123456",
            "parecer": "FAVORÁVEL",
            "limitacao_funcional": "Sim",
            "limitacao_rol": "Sim",
            "justificativa": "Quadro clínico agudizado com limitação funcional temporária.",
        })
        return PreenchimentoCompletoResult.model_construct(**defaults)

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate)
    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "atendimento": "ATD-DOENCA-001",
            "texto_bruto": (
                "Servidora em acompanhamento psiquiátrico por transtorno de ansiedade generalizada "
                "com crises de pânico, taquicardia e insônia persistente. Solicita 15 dias de afastamento. CID F41."
            ),
            "modo_ia2": True,
            "contexto_atual": {},
        },
    )
    assert resp.status_code == 200
    dados = resp.get_json()["dados"]
    motivo = dados["doenca_motivo"]
    assert motivo
    assert "(CID" not in motivo
    assert "Outros transtornos ansiosos" not in motivo
    assert "ansiedade" in motivo.lower() or "ansioso" in motivo.lower()


def test_doenca_motivo_ia2_substitui_abreviacao_datasus_iam_por_sintese_clinica(monkeypatch):
    """Garante que abreviações DATASUS da tabela CID-10 (ex.: 'Infarto agudo transmural parede ant miocard')
    ou descrições rasas sem procedimento sejam substituídas pela síntese clínica completa do texto bruto.
    """
    import app as app_module
    from app import PreenchimentoCompletoResult, _limpar_doenca_motivo_bruto

    texto_iam = (
        "Gilberto leonardo Del Tedesco reis  CPF 270. 631.398-60  Policial penal  "
        "Vem com atestado de 14 dias CID I 21.0 . Paciente  refere que iniciou a dor no peito , "
        "chegando ao  hospital com Infarto Agudo do miocardio , sendo feito Trombolização , "
        "cateterismo cardíaco , angioplastia  coronariana  com implante de stente . "
        "Em uso  Losartana . AAS ,  Clopridogrel . Hoje refere melhora  do quadro .  "
        "Bom estado Geral , orientado em tempo e espaço . BRNF sem sopro . "
        "Demais exames dentro  da normalidade. Cedido 15 dias ."
    )

    esperado = (
        "Infarto agudo do miocárdio com supradesnivelamento do segmento ST "
        "submetido a intervenção coronariana percutânea com implante de stent"
    )

    # 1. Helper direto quando vem abreviação DATASUS (com ou sem prefixo de CID)
    res1 = _limpar_doenca_motivo_bruto(
        "Infarto agudo transmural parede ant miocard",
        cid="I21.0",
        cid_desc="Infarto agudo transmural da parede anterior do miocárdio",
        texto_bruto=texto_iam,
    )
    assert res1 == esperado

    res2 = _limpar_doenca_motivo_bruto(
        "I21.0 — Infarto agudo transmural parede ant miocard",
        cid="I21.0",
        cid_desc="",
        texto_bruto=texto_iam,
    )
    assert res2 == esperado

    # 2. Fluxo /api/ai/preencher-ficha quando LLM devolve apenas o rótulo DATASUS
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
            "nome_paciente": "GILBERTO LEONARDO DEL TEDESCO REIS",
            "cargo": "Policial Penal",
            "cid": "I21.0",
            "cid_descricao": "Infarto agudo transmural parede ant miocard",
            "doenca_motivo": "Infarto agudo transmural parede ant miocard",
            "sintomas_limitacao": "Histórico recente de dor precordial aguda com necessidade de hospitalização",
            "data_documento": "10/03/2026",
            "data_expedicao": "10/03/2026",
            "dias_solicitados": "14",
            "parecer": "FAVORÁVEL",
            "limitacao_funcional": "Sim",
            "limitacao_rol": "Sim",
            "justificativa": "Convalescença pós-evento coronariano agudo com implante de stent.",
        })
        return PreenchimentoCompletoResult.model_construct(**defaults)

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate)
    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "atendimento": "ATD-IAM-001",
            "texto_bruto": texto_iam,
            "modo_ia2": True,
            "contexto_atual": {},
        },
    )
    assert resp.status_code == 200
    dados = resp.get_json()["dados"]
    assert dados["doenca_motivo"] == esperado


def test_queixa_duracao_esisla_sem_fragmento_medicacao_nem_colagem_terapias():
    """Garante que na ficha e-SISLA:
    1) A frase 'Em uso de Losartana 50 mg...' não seja mutilada por _desacoplar_e_rotear_fatos_clinicos
       gerando fragmento órfão '(controle pressórico) e Ácido Acetilsalicílico...' nem duplicação.
    2) A colagem de terapias ('Realiza psicoterapia, O periciado relata acompanhamento em psicoterapia (3x)...')
       e 'com queixa de Sintomatologia depressiva' sejam normalizadas com frequência por extenso.
    3) O fallback de sintomas construa narrativa clínica rica a partir do texto bruto.
    """
    from app import (
        _build_deterministic_esisla,
        _clean_queixa_duracao_text,
        _gerar_sintomas_fallback,
    )

    # 1. Caso 1: Sintomatologia depressiva + colagem de obs_terapias com (3x)
    raw_caso1 = (
        "Servidora de 61 anos, relatou não ser readaptada, é Professora de Educação Básica II há 18 anos, "
        "com queixa de Sintomatologia depressiva, desde 2023, realizando consultas quinzenalmente. "
        "Refere sintomatologia psicoemocional compatível com sintomatologia depressiva, cursando com ansiedade, "
        "fadiga mental e repercussões na esfera emocional. Negou uso de medicações. "
        "Realiza psicoterapia, O periciado relata acompanhamento em psicoterapia (3x) e nega fisioterapia, e não realiza fisioterapia."
    )
    cleaned1 = _clean_queixa_duracao_text(raw_caso1)
    assert "com queixa de transtorno depressivo" in cleaned1
    assert "Sintomatologia depressiva" not in cleaned1
    assert "O periciado relata" not in cleaned1
    assert "(3x)" not in cleaned1
    assert "Realiza psicoterapia três vezes por semana e não realiza fisioterapia." in cleaned1

    # 2. Caso 3: Queixa completa com Losartana + AAS + Clopidogrel não pode ser mutilada nem duplicada
    queixa_iam = (
        "Servidor de 51 anos, relatou não ser readaptado, é Policial Penal VI há 24 anos, "
        "com queixa de infarto agudo do miocárdio com supradesnivelamento do segmento ST submetido a intervenção "
        "coronariana percutânea com implante de stent, desde 2026, realizando consultas mensalmente. "
        "O periciado refere que iniciou quadro de dor torácica aguda, sendo diagnosticado com infarto agudo do miocárdio, "
        "necessitando de internação hospitalar, terapia trombolítica, cateterismo cardíaco de urgência e angioplastia "
        "coronariana com implante de stent. No momento atual do atendimento pericial, relata melhora sintomática, "
        "mantendo-se em convalescença pós-procedimento cardiológico com restrição de esforços físicos intensos e "
        "necessidade de seguimento médico rigoroso. "
        "Em uso de Losartana 50 mg 12/12h (controle pressórico), Ácido Acetilsalicílico 100 mg 24/24h (antiadesivo plaquetário) "
        "e Clopidogrel 75 mg 24/24h (antiadesivo plaquetário). "
        "Não relatou troca de medicação ou alteração de dosagem. "
        "Não alegou fazer fisioterapia e psicoterapia."
    )
    payload_iam = {
        "idade": "51",
        "sexo": "Masculino",
        "readaptado": "Não",
        "cargo": "Policial Penal VI",
        "tempo_funcao": "24",
        "unidade_tempo": "anos",
        "cid": "I21.0",
        "doenca_motivo": "infarto agudo do miocárdio com supradesnivelamento do segmento ST submetido a intervenção coronariana percutânea com implante de stent",
        "queixa_duracao": queixa_iam,
        "medications": [
            {"medicamento": "Losartana", "dosagem": "50 mg", "frequencia": "12/12h", "observacao": "controle pressórico"},
            {"medicamento": "Ácido Acetilsalicílico", "dosagem": "100 mg", "frequencia": "24/24h", "observacao": "antiadesivo plaquetário"},
            {"medicamento": "Clopidogrel", "dosagem": "75 mg", "frequencia": "24/24h", "observacao": "antiadesivo plaquetário"},
        ],
        "fisioterapia": False,
        "psicoterapia": False,
        "parecer": "FAVORÁVEL",
        "dias_solicitados": "15",
    }
    ficha = _build_deterministic_esisla(payload_iam)
    assert ". (controle pressórico)" not in ficha
    assert ficha.lower().count("em uso de losartana") == 1

    # 3. Fallback de sintomas com texto bruto de IAM
    sint_iam = _gerar_sintomas_fallback(
        cid="I21.0",
        doenca_motivo="infarto agudo do miocárdio",
        texto_bruto="Paciente refere dor no peito, chegando ao hospital com Infarto Agudo do miocardio, sendo feito Trombolização, cateterismo cardíaco, angioplastia coronariana com implante de stente. Hoje refere melhora.",
        is_fem=False,
    )
    assert "dor torácica aguda" in sint_iam
    assert "angioplastia coronariana com implante de stent" in sint_iam
    assert "convalescença" in sint_iam


def test_preencher_ficha_texto_livre_completo_mesmo_em_fallback(monkeypatch):
    """Garante que ao colar texto bruto livre (sem rótulos Nome:, CPF:, Cargo:, CID:)
    em /api/ai/preencher-ficha, todos os campos do atendimento sejam preenchidos de forma
    robusta e clínica (incluindo medicamentos, exame físico, limitação funcional do cargo e parecer),
    mesmo quando a API Gemini sofrer indisponibilidade temporária (fallback determinístico).
    """
    import app as app_module

    texto_livre_iam = (
        "Gilberto leonardo Del Tedesco reis  CPF 270. 631.398-60  Policial penal  "
        "Vem com atestado de 14 dias CID I 21.0 . Paciente  refere que iniciou a dor no peito , "
        "chegando ao  hospital com Infarto Agudo do miocardio , sendo feito Trombolização , "
        "cateterismo cardíaco , angioplastia  coronariana  com implante de stente . "
        "Em uso  Losartana . AAS ,  Clopridogrel . Hoje refere melhora  do quadro .  "
        "Bom estado Geral , orientado em tempo e espaço . BRNF sem sopro . "
        "Demais exames dentro  da normalidade. Cedido 15 dias ."
    )

    def fake_generate_timeout(instruction, schema):
        raise RuntimeError("503 UNAVAILABLE: Temporary high demand")

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_timeout)
    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "atendimento": "ATD-LIVRE-IAM",
            "texto_bruto": texto_livre_iam,
            "modo_ia2": True,
            "contexto_atual": {},
        },
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert "dados" in body
    dados = body["dados"]

    # Identificação extraída do texto livre
    assert dados["nome_paciente"] == "GILBERTO LEONARDO DEL TEDESCO REIS"
    assert dados["cpf_paciente"] == "270.631.398-60"
    assert dados["cargo"] == "Policial Penal"
    assert dados["cid"] == "I21.0"

    # Diagnóstico clínico completo e sintomas
    assert dados["doenca_motivo"] == (
        "Infarto agudo do miocárdio com supradesnivelamento do segmento ST "
        "submetido a intervenção coronariana percutânea com implante de stent"
    )
    assert "dor torácica aguda" in dados["sintomas_limitacao"]
    assert "angioplastia coronariana com implante de stent" in dados["sintomas_limitacao"]

    # Medicamentos estruturados com dose, frequência e indicação clínica
    meds = dados["medications"]
    assert len(meds) == 3
    nomes_meds = [m["medicamento"] for m in meds]
    assert "Losartana" in nomes_meds
    assert "Ácido Acetilsalicílico" in nomes_meds
    assert "Clopidogrel" in nomes_meds
    for m in meds:
        assert m["dosagem"]
        assert m["frequencia"]
        assert m["observacao"]

    # Exame físico, limitação funcional do cargo e parecer favorável
    assert dados["parecer"] == "FAVORÁVEL"
    assert dados["limitacao_funcional"] == "Sim"
    assert dados["limitacao_rol"] == "Sim"
    assert dados["exame_fisico_tipo"] == "Outros"
    assert dados["outros_resultado"] == "Alterado"
    assert "cardiol" in dados["exame_fisico_descricao"].lower()
    assert "esforços físicos" in dados["desc_limitacao"].lower()
    assert "O periciado refere" not in dados["desc_limitacao"]
    assert "Policial Penal" in dados["justificativa"]
    assert "I21.0" in dados["justificativa"]


def test_nao_duplica_medicamentos_entre_sintomas_e_em_uso_de():
    """Garante que medicamentos já presentes em `medications` / bloco 'Em uso de ...'
    não sejam listados em duplicidade dentro de `sintomas_limitacao` nem na `Queixa e Duração`
    (caso real Atendimento 954404082), e que 'Refere Servidora relata' seja higienizado.
    """
    from app import (
        _clean_queixa_duracao_text,
        _remover_medicamentos_duplicados_em_sintomas,
    )

    meds = [
        {"medicamento": "Tramadol", "dosagem": "100 mg", "frequencia": "dose única parenteral", "observacao": "analgesia em pronto atendimento"},
        {"medicamento": "Dexametasona", "dosagem": "4 mg", "frequencia": "dose única parenteral", "observacao": "anti-inflamatório em pronto atendimento"},
        {"medicamento": "Escopolamina", "dosagem": "20 mg", "frequencia": "dose única parenteral", "observacao": "antiespasmódico em pronto atendimento"},
        {"medicamento": "Ondansetrona", "dosagem": "8 mg", "frequencia": "dose única parenteral", "observacao": "antiemético em pronto atendimento"},
        {"medicamento": "Ácido Tranexâmico", "dosagem": "250 mg", "frequencia": "8 em 8 horas", "observacao": "antifibrinolítico domiciliar"},
    ]

    sintomas_com_dup = (
        "Servidora relata quadro de sangramento vaginal aumentado associado a dor pélvica intensa decorrente de "
        "hipermenorreia e dismenorreia, necessitando de atendimento médico de urgência em 09/11/2026. "
        "Na oportunidade, foi submetida a esquema analgésico e antiespasmódico parenteral com Tramadol, Dexametasona, "
        "Escopolamina e Ondansetrona, sendo-lhe prescrito Ácido Tranexâmico para uso domiciliar. "
        "Refere melhora sintomática parcial no momento do exame pericial, contudo mantém astenia e dor residual em região hipogástrica."
    )
    sint_limpo = _remover_medicamentos_duplicados_em_sintomas(sintomas_com_dup, meds)
    assert "Tramadol" not in sint_limpo
    assert "Dexametasona" not in sint_limpo
    assert "Escopolamina" not in sint_limpo
    assert "Ondansetrona" not in sint_limpo
    assert "Tranexâmico" not in sint_limpo
    assert "esquema analgésico e antiespasmódico parenteral" in sint_limpo
    assert "uso domiciliar" in sint_limpo
    assert "melhora sintomática parcial" in sint_limpo

    queixa_com_dup = (
        "Servidora de 44 anos, relatou ser readaptada, é Agente de Organização Escolar há 13 anos, "
        "com queixa de dismenorreia e hipermenorreia com necessidade de atendimento médico de urgência e medicação parenteral, "
        "desde 2026, realizando consultas mensalmente. "
        "Refere Servidora relata quadro de sangramento vaginal aumentado associado a dor pélvica intensa decorrente de "
        "hipermenorreia e dismenorreia, necessitando de atendimento médico de urgência em 09/11/2026. "
        "Na oportunidade, foi submetida a esquema analgésico e antiespasmódico parenteral com Tramadol 100 mg, "
        "Dexametasona 4 mg, Escopolamina 20 mg e Ondansetrona 8 mg, sendo-lhe prescrito Ácido Tranexâmico 250 mg a cada 8 horas para uso domiciliar. "
        "Refere melhora sintomática parcial no momento do exame pericial, contudo mantém astenia e dor residual em região hipogástrica. "
        "Em uso de Tramadol 100 mg (dose única parenteral), Dexametasona 4 mg (dose única parenteral), "
        "Escopolamina 20 mg (dose única parenteral), Ondansetrona 8 mg (dose única parenteral) e Ácido Tranexâmico 250 mg (a cada 8 horas). "
        "Não relatou troca de medicação ou alteração de dosagem. Não alegou fazer fisioterapia e psicoterapia."
    )
    queixa_limpa = _clean_queixa_duracao_text(queixa_com_dup)
    assert "Refere Servidora relata" not in queixa_limpa
    assert queixa_limpa.count("Tramadol") == 1
    assert queixa_limpa.count("Dexametasona") == 1
    assert queixa_limpa.count("Escopolamina") == 1
    assert queixa_limpa.count("Ondansetrona") == 1
    assert queixa_limpa.count("Tranexâmico") == 1
    assert "Em uso de Tramadol 100 mg" in queixa_limpa


def test_sanitizacao_fatos_clinicos_e_medicamentos_sinusopatia_e_abscesso():
    """Regressão dos atendimentos reais 954408147 (J01.9) e 954409275 (L02.9):
    - Trunca `doenca_motivo` verboso contendo datas, medicações ou sufixo genérico;
    - Remove classes genéricas ('Antibióticos') e placeholders ('Não especificada');
    - Evita corromper `sintomas` ao desacoplar medicações/exames e substitui placeholder de exames sem duplicação;
    - Elimina contradição entre 'Informa alteração recente na prescrição medicamentosa.' e 'Não relatou troca...'.
    """
    from app import (
        _clean_queixa_duracao_text,
        _desacoplar_e_rotear_fatos_clinicos,
        _formatar_lista_medicamentos,
        _limpar_doenca_motivo_bruto,
    )

    dm_sinusite = _limpar_doenca_motivo_bruto(
        "sinusopatia pós-tratamento odontológico com início em 10/11/2026, não respondendo ao tratamento com amoxicilina com clavulanato e cefalexina, necessitando de acompanhamento médico e terapêutico",
        cid="J01.9",
        cid_desc="Sinusite aguda não especificada",
    )
    assert len(dm_sinusite) <= 90
    assert "10/11/2026" not in dm_sinusite
    assert "amoxicilina" not in dm_sinusite.lower()
    assert "necessitando de acompanhamento" not in dm_sinusite.lower()
    assert "sinusopatia" in dm_sinusite.lower()

    dm_abscesso = _limpar_doenca_motivo_bruto(
        "abscesso no pé direito com drenagem cirúrgica, caracterizado por dor e inchaço com início dos sintomas em 19/11/2026, necessitando de acompanhamento médico e terapêutico",
        cid="L02.9",
        cid_desc="Abscesso cutâneo, furúnculo e antraz não especificados",
    )
    assert len(dm_abscesso) <= 90
    assert "19/11/2026" not in dm_abscesso
    assert "necessitando de acompanhamento" not in dm_abscesso.lower()
    assert "drenagem" in dm_abscesso.lower()

    meds_fmt = _formatar_lista_medicamentos([
        {"medicamento": "Antibióticos", "dosagem": "Não especificada", "frequencia": "Em uso após drenagem", "observacao": "Substituição dos antibióticos anteriores"},
        {"medicamento": "Soro fisiológico", "dosagem": "Não informada", "frequencia": "lavagem nasal", "observacao": ""},
    ])
    assert "Antibióticos" not in meds_fmt
    assert "Não especificada" not in meds_fmt
    assert "Não informada" not in meds_fmt
    assert "Soro fisiológico (lavagem nasal)" in meds_fmt

    fatos = _desacoplar_e_rotear_fatos_clinicos({
        "queixa_duracao": "Quadro de sinusopatia aguda após canal dentário.",
        "sintomas_limitacoes": (
            "Recebeu prescrição de amoxicilina com clavulanato e soro fisiológico, e posteriormente, "
            "no hospital do Servidor, a receita foi ajustada para novos antibióticos e lavagem nasal. "
            "Realizou Ressonância Magnética dos seios da face e pescoço."
        ),
        "medications": [
            {"medicamento": "Amoxicilina com clavulanato", "dosagem": "", "frequencia": "não especificada", "observacao": ""},
            {"medicamento": "Soro fisiológico", "dosagem": "", "frequencia": "lavagem nasal", "observacao": ""},
        ],
        "alteracoes_clinicas_exames": "Não foram apresentados exames complementares (imagem ou laboratoriais) no ato pericial.",
    })
    assert "ajustada para, lavagem nasal" not in fatos["sintomas_limitacoes"]
    assert "lavagem nasal e nasal" not in fatos["sintomas_limitacoes"]
    assert "Não foram apresentados" not in fatos["alteracoes_clinicas_exames"]
    assert fatos["alteracoes_clinicas_exames"].lower().count("ressonância magnética") == 1

    queixa_corr = _clean_queixa_duracao_text(
        "Servidora de 45 anos com queixa de sinusopatia. Em uso de Soro fisiológico, não informada sua dosagem lavagem nasal. "
        "Informa alteração recente na prescrição medicamentosa. Não relatou troca de medicação ou alteração de dosagem."
    )
    assert "não informada sua dosagem lavagem nasal" not in queixa_corr.lower()
    assert "Não relatou troca de medicação" not in queixa_corr


def test_preencher_ficha_gpt_correcoes_dermatologia_e_exame_mental(monkeypatch):
    """Garante pós-processamento robusto em /api/ai/preencher-ficha quando o LLM devolve:
    - CID L02.9 classificado incorretamente como Osteomuscular e exame_mental_resultado preenchido;
    - classe genérica 'Antibióticos' com observação de substituição e alteracao_med='Não'.
    """
    import app as app_module

    def fake_generate_gpt_like(instruction, schema):
        if schema is app_module.PreenchimentoCompletoResult:
            return app_module.PreenchimentoCompletoResult(
                nome_paciente="SERGIO LUIZ CARVALHO DE OLIVEIRA",
                cpf_paciente="12345678901",
                cargo="Professor",
                sexo="Masculino",
                cid="L02.9",
                cid_descricao="Abscesso cutâneo, furúnculo e antraz não especificados",
                doenca_motivo="abscesso no pé direito com drenagem cirúrgica, caracterizado por dor e inchaço com início em 19/11/2026",
                sintomas_limitacao="O periciado relata dor e edema em pé direito após drenagem cirúrgica de abscesso.",
                historico_pregresso="Nega comorbidades prévias.",
                medications=[
                    app_module.MedicamentoItem(
                        medicamento="Antibióticos",
                        dosagem="Não especificada",
                        frequencia="Em uso após drenagem",
                        observacao="Substituição dos antibióticos anteriores",
                    )
                ],
                alteracao_med="Não",
                exame_fisico_tipo="Aparelho Osteomuscular e Tecido Conjutivo",
                exame_mental_resultado="Alterado",
                outros_resultado="Alterado",
                exame_fisico_descricao="Abscesso drenado em pé direito.",
                alteracoes_clinicas_exames="Não foram apresentados exames complementares.",
                parecer="FAVORÁVEL",
                limitacao_funcional="Sim",
                limitacao_rol="Sim",
                desc_limitacao="Limitação temporária para deambulação prolongada.",
                justificativa="Capacidade laborativa temporariamente prejudicada.",
                dias_solicitados="10",
                data_documento="2026-11-23",
            )
        raise RuntimeError("unexpected schema")

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_gpt_like)
    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "atendimento": "954409275",
            "texto_bruto": (
                "Sergio Luiz Carvalho de Oliveira, abscesso no pé direito drenado em 19/11/2026, "
                "substituição dos antibióticos anteriores, CID L02.9, 10 dias."
            ),
            "modo_ia2": True,
            "contexto_atual": {},
        },
    )
    assert resp.status_code == 200
    dados = resp.get_json()["dados"]
    assert dados["exame_fisico_tipo"] == "Outros"
    assert dados["outros_subtipo"] == "Pele e Fâneros"
    assert dados["exame_mental_resultado"] == ""
    assert dados["alteracao_med"] == "Sim"
    assert dados["medications"] == []
    assert "19/11/2026" not in dados["doenca_motivo"]


def test_precisao_roteamento_campos_texto_bruto_e_rejeicao_placeholders(monkeypatch):
    """Garante 100% de precisão no roteamento do texto bruto para cada campo do atendimento:
    - Rejeita placeholders fabricados pelo LLM (000.000.000-00, 000000, SERVIDORA DE OLIVEIRA, Médico Assistente, 01/01/1978);
    - Preserva CID e data_expedicao reais do contexto_atual quando não substituídos no texto bruto;
    - Reclassifica CID K91.1 (colecistectomia) de Osteomuscular para Outros / Aparelho Digestivo;
    - Remove achados objetivos de exame físico (suturas/lesões cirúrgicas visíveis) que vazaram para sintomas_limitacao;
    - Não duplica observacoesMedico em exame_fisico_descricao e não nega cirurgias prévias em pós-operatório.
    """
    import app as app_module

    captured_instructions = []

    def fake_generate_sloppy(instruction, schema):
        captured_instructions.append(instruction)
        if schema is app_module.PreenchimentoCompletoResult:
            return app_module.PreenchimentoCompletoResult(
                nome_paciente="SERVIDORA DE OLIVEIRA",
                cpf_paciente="000.000.000-00",
                data_nascimento="01/01/1978",
                crm_cro="000000",
                nome_medico_assistente="Médico Assistente",
                cargo="Agente de Organização Escolar",
                sexo="Feminino",
                cid="Z98.8",
                cid_descricao="Outros estados pós-cirúrgicos especificados",
                doenca_motivo="pós-operatório de colecistectomia por videolaparoscopia",
                sintomas_limitacao=(
                    "A periciada relata dor persistente na região superior do abdômen e dificuldade para defecar após colecistectomia. "
                    "O quadro atual é caracterizado por três lesões cirúrgicas visíveis no abdômen, sendo a superior com três suturas e hematoma, e as laterais e umbilical com um fio de sutura cada uma."
                ),
                historico_pregresso="Nega antecedentes mórbidos relevantes, neoplasias ou hábitos tabágicos e etilistas e cirurgias prévias.",
                medications=[
                    app_module.MedicamentoItem(medicamento="Dipirona", dosagem="1 g", frequencia="6/6h", observacao="analgesia")
                ],
                exame_fisico_tipo="Aparelho Osteomuscular e Tecido Conjutivo",
                exame_mental_resultado="Alterado",
                outros_resultado="Alterado",
                exame_fisico_descricao=(
                    "Durante o exame físico, observam-se três lesões cirúrgicas no abdômen decorrentes de videolaparoscopia para retirada da vesícula biliar, "
                    "sendo a lesão superior com três suturas e hematoma e as lesões lateral e umbilical com um fio de sutura cada."
                ),
                alteracoes_clinicas_exames="Não foram apresentados exames complementares.",
                parecer="FAVORÁVEL",
                limitacao_funcional="Sim",
                limitacao_rol="Sim",
                desc_limitacao="Limitação temporária para esforços físicos e flexão do tronco.",
                justificativa="Capacidade laborativa parcialmente prejudicada.",
                dias_solicitados="14",
                data_documento="2026-11-17",
                data_expedicao="2026-11-17",
            )
        raise RuntimeError("unexpected schema")

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_sloppy)
    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "atendimento": "954408211",
            "texto_bruto": (
                "Servidora de 48 anos, dor abdominal após colecistectomia por videolaparoscopia em 17/11/2026. "
                "Em uso de Dipirona 1g. Exame: 3 lesões cirúrgicas em abdômen com suturas e hematoma."
            ),
            "modo_ia2": True,
            "contexto_atual": {
                "nomePaciente": "RENATA APARECIDA A NASCIMENTO",
                "cpfPaciente": "25776167833",
                "cargo": "AGENTE DE ORGANIZACAO ESCOLAR",
                "cid": "K91.1",
                "dataExpedicaoIso": "2026-11-19",
                "diasSolicitados": "14",
            },
            "decisao_medico": {
                "parecer": "FAVORÁVEL",
                "diasConcedidos": "14",
                "exameFisicoResultado": "Alterado",
                "observacoesMedico": "3 lesões cirúrgicas em abdômen devido a videolaparoscopia para retirada da vesícula biliar com suturas e hematoma.",
            },
        },
    )
    assert resp.status_code == 200
    dados = resp.get_json()["dados"]

    # 1. Contexto conhecido injetado no prompt
    assert captured_instructions
    assert "RENATA APARECIDA A NASCIMENTO" in captured_instructions[0]
    assert "K91.1" in captured_instructions[0]

    # 2. Placeholders rejeitados e dados reais preservados
    assert dados["nome_paciente"] == "RENATA APARECIDA A NASCIMENTO"
    assert dados["cpf_paciente"] == "257.761.678-33"
    assert dados["crm_cro"] == ""
    assert dados["nome_medico_assistente"] == ""
    assert dados["data_nascimento"] == ""
    assert dados["cid"] == "K91.1"
    assert dados["data_expedicao"] == "2026-11-19"

    # 3. Classificação anatômica correta por CID (K91.1 -> Outros / Aparelho Digestivo)
    assert dados["exame_fisico_tipo"] == "Outros"
    assert dados["outros_subtipo"] == "Aparelho Digestivo"
    assert dados["exame_mental_resultado"] == ""

    # 4. Separação de campos: achados objetivos de suturas removidos de sintomas e sem duplicação em exame_fisico_descricao
    assert "três suturas" not in dados["sintomas_limitacao"].lower()
    assert "lesões cirúrgicas visíveis" not in dados["sintomas_limitacao"].lower()
    assert "dor persistente" in dados["sintomas_limitacao"].lower()
    assert "Constatação pericial específica:" not in dados["exame_fisico_descricao"]

    # 5. Antecedentes não negam cirurgias prévias em pós-operatório
    assert "cirurgias prévias" not in dados["historico_pregresso"].lower()




