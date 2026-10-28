import asyncio
import json
import sys
from pathlib import Path
import edge_tts
from app import app

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

CENARIOS_AVANCADOS = {
    "cenario_d_contradicoes_e_divagacoes": {
        "descricao": "Paciente confuso, com divagacoes familiares, contradicao de datas e incerteza sobre nome de medicamento",
        "dialogo": [
            ("pt-BR-ThalitaNeural", "Bom dia! Qual é a sua idade, seu cargo e há quanto tempo trabalha no Estado?"),
            ("pt-BR-AntonioNeural", "Bom dia doutora... olha, minha vida está muito difícil, meu genro perdeu o emprego mês passado... ah, desculpe, eu tenho 58 anos, sou merendeiro escolar e trabalho no Estado há 22 anos."),
            ("pt-BR-ThalitaNeural", "O senhor é readaptado atualmente?"),
            ("pt-BR-AntonioNeural", "Sim, sou readaptado há 4 anos, hoje fico só entregando chave e cuidando do portão da escola."),
            ("pt-BR-ThalitaNeural", "Qual é a doença que motivou o pedido de licença e quando foi o diagnóstico?"),
            ("pt-BR-AntonioNeural", "É depressão grave e síndrome do pânico, CID F33. O diagnóstico foi em março de 2022... quer dizer, na verdade o médico falou que começou mesmo foi em novembro de 2025, não sei se o laudo antigo valia."),
            ("pt-BR-ThalitaNeural", "Com que frequência o senhor passa em consulta médica e o que sente no trabalho?"),
            ("pt-BR-AntonioNeural", "Vou ao médico a cada 20 dias. No trabalho sinto tremedeira nas mãos, choro constante, medo de sair de casa e tontura."),
            ("pt-BR-ThalitaNeural", "Quais medicamentos está tomando e quais as dosagens em miligramas?"),
            ("pt-BR-AntonioNeural", "Tomo sertralina de 100 miligramas de manhã e à noite tomo um comprimido de tarja preta que não lembro se é clonazepam ou alprazolam, acho que é de 2 miligramas."),
            ("pt-BR-ThalitaNeural", "O senhor faz psicoterapia ou fisioterapia?"),
            ("pt-BR-AntonioNeural", "Faço psicoterapia toda quarta-feira no posto de saúde.")
        ],
        "validacoes": {
            "espera_duvidas": True,
            "todos_11_respondidos": True
        }
    },
    "cenario_e_cardiologia_pos_cirurgico": {
        "descricao": "Pericia cardiologica pos-infarto com angioplastia, multiplos farmacos cardiovasculares e reabilitacao",
        "dialogo": [
            ("pt-BR-ThalitaNeural", "Olá, pode se sentar. Informe por gentileza sua idade, cargo e tempo de serviço."),
            ("pt-BR-AntonioNeural", "Bom dia doutora. Tenho 61 anos, sou diretor de escola estadual há 28 anos."),
            ("pt-BR-ThalitaNeural", "O senhor é readaptado?"),
            ("pt-BR-AntonioNeural", "Não doutora, nunca fui readaptado, sempre atuei na direção."),
            ("pt-BR-ThalitaNeural", "Qual foi o problema de saúde que gerou o afastamento e a data do ocorrido?"),
            ("pt-BR-AntonioNeural", "Sofri um infarto agudo do miocárdio no dia 14 de setembro de 2025 e precisei colocar dois stents coronarianos de urgência. O CID é I21."),
            ("pt-BR-ThalitaNeural", "Com que frequência está passando no cardiologista?"),
            ("pt-BR-AntonioNeural", "Estou passando em consulta quinzenalmente para controle rigoroso."),
            ("pt-BR-ThalitaNeural", "Quais sintomas ainda sente que limitam seu retorno à direção da escola?"),
            ("pt-BR-AntonioNeural", "Sinto cansaço extremo aos pequenos esforços, falta de ar ao subir as escadas da escola e dor no peito quando passo por estresse em reuniões."),
            ("pt-BR-ThalitaNeural", "Quais medicações está utilizando e em quais dosagens diárias?"),
            ("pt-BR-AntonioNeural", "Uso clopidogrel de 75 miligramas ao dia, ácido acetilsalicílico de 100 miligramas no almoço, carvedilol de 25 miligramas de 12 em 12 horas e rosuvastatina de 20 miligramas à noite."),
            ("pt-BR-ThalitaNeural", "Está fazendo fisioterapia ou reabilitação cardiovascular?"),
            ("pt-BR-AntonioNeural", "Sim, faço fisioterapia de reabilitação cardíaca supervisionada duas vezes por semana."),
            ("pt-BR-ThalitaNeural", "Trouxe o ecocardiograma recente? Qual foi a fração de ejeção?"),
            ("pt-BR-AntonioNeural", "Trouxe sim doutora, o ecocardiograma da semana passada mostrou fração de ejeção de 42 por cento.")
        ],
        "validacoes": {
            "farmacos": ["clopidogrel", "carvedilol", "rosuvastatina"],
            "todos_11_respondidos": True,
            "espera_extra": True
        }
    },
    "cenario_f_respostas_negativas": {
        "descricao": "Medico pergunta todos os itens, mas paciente responde que NAO toma remedios e NAO faz fisioterapia ainda",
        "dialogo": [
            ("pt-BR-ThalitaNeural", "Boa tarde. Qual é a sua idade, seu cargo e há quanto tempo está na função?"),
            ("pt-BR-AntonioNeural", "Boa tarde doutora. Tenho 34 anos, sou professor de educação física há 6 anos."),
            ("pt-BR-ThalitaNeural", "Você é readaptado?"),
            ("pt-BR-AntonioNeural", "Não sou readaptado."),
            ("pt-BR-ThalitaNeural", "Qual é a lesão que motivou o afastamento e quando aconteceu?"),
            ("pt-BR-AntonioNeural", "Ruptura parcial do ligamento cruzado anterior do joelho direito, CID S83.5. Aconteceu no dia 2 de outubro de 2025 durante aula na quadra."),
            ("pt-BR-ThalitaNeural", "Com que frequência passa no ortopedista e o que sente no joelho?"),
            ("pt-BR-AntonioNeural", "Passo a cada 15 dias. Meu joelho está muito inchado, falseando e não consigo dobrar nem correr na quadra."),
            ("pt-BR-ThalitaNeural", "Você está tomando alguma medicação no momento? Se sim, qual a dosagem?"),
            ("pt-BR-AntonioNeural", "Não estou tomando nenhum medicamento agora, doutora, porque tive alergia ao anti-inflamatório e o médico mandou suspender todas as doses e usar apenas compressa de gelo."),
            ("pt-BR-ThalitaNeural", "Já iniciou as sessões de fisioterapia?"),
            ("pt-BR-AntonioNeural", "Ainda não iniciei a fisioterapia porque o ortopedista pediu para aguardar desinchar mais uma semana antes de começar.")
        ],
        "validacoes": {
            "verificar_negativas_como_perguntadas": [4, 9, 11]
        }
    }
}

async def sintetizar_audio(caminho: Path, dialogo):
    buf = bytearray()
    for idx, (voz, texto) in enumerate(dialogo, 1):
        for tentativa in range(4):
            try:
                comm = edge_tts.Communicate(texto, voz, rate="+0%")
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        buf.extend(chunk["data"])
                await asyncio.sleep(0.3)
                break
            except Exception as e:
                if tentativa == 3:
                    raise RuntimeError(f"Falha no turno {idx}: {e}")
                await asyncio.sleep(1.0 * (tentativa + 1))
    caminho.write_bytes(buf)

def executar_bateria_avancada():
    client = app.test_client()
    resultados = []

    for nome, cfg in CENARIOS_AVANCADOS.items():
        mp3_path = Path(f"teste_{nome}.mp3")
        print(f"\n========================================================")
        print(f"CENARIO: {nome}")
        print(f"Objetivo: {cfg['descricao']}")
        print(f"========================================================")

        if not mp3_path.exists() or mp3_path.stat().st_size < 10000:
            print("Sintetizando audio via edge_tts...")
            asyncio.run(sintetizar_audio(mp3_path, cfg["dialogo"]))
            print(f"Audio salvo: {mp3_path} ({mp3_path.stat().st_size} bytes)")

        with open(mp3_path, "rb") as f_audio:
            resp = client.post(
                "/api/ai/refinar-dialogo-ia2",
                data={"audio": (f_audio, mp3_path.name, "audio/mp3")},
                content_type="multipart/form-data"
            )

        assert resp.status_code == 200, f"Erro HTTP {resp.status_code}: {resp.data.decode('utf-8')}"
        payload = resp.get_json()
        data = payload.get("data") or payload

        dialogo = data.get("dialogo") or []
        colinha = data.get("colinha_status") or []
        texto_fmt = data.get("texto_formatado") or ""
        total_duvidas = data.get("total_duvidas", 0)

        respondidos = [c.get("id") for c in colinha if c.get("matched")]
        pendentes = [c.get("id") for c in colinha if not c.get("matched")]
        extras = [d for d in dialogo if d.get("colinha_id") is None]
        duvidas_lista = [d.get("duvidas") for d in dialogo if d.get("duvidas")]

        print(f"-> Cartoes gerados: {len(dialogo)}")
        print(f"-> Colinha respondidos ({len(respondidos)}/11): {respondidos}")
        print(f"-> Colinha pendentes: {pendentes}")
        print(f"-> Perguntas adicionais: {len(extras)}")
        print(f"-> Total de duvidas apontadas: {total_duvidas} | Detalhes: {duvidas_lista}")

        val = cfg.get("validacoes", {})
        if val.get("farmacos"):
            for farm in val["farmacos"]:
                ok = farm.lower() in texto_fmt.lower()
                print(f"   [{'OK' if ok else 'FALHA'}] Farmaco '{farm}' presente na transcricao: {ok}")

        if val.get("verificar_negativas_como_perguntadas"):
            for item_id in val["verificar_negativas_como_perguntadas"]:
                foi_marcado = item_id in respondidos
                print(f"   [{'OK' if foi_marcado else 'FALSO_NEGATIVO'}] Item {item_id} (resposta negativa) marcado como respondido: {foi_marcado}")

        # Teste End-to-End no Cenario E: gerar PreenchimentoCompletoResult a partir do texto_formatado do audio
        ficha_ok = None
        if nome == "cenario_e_cardiologia_pos_cirurgico":
            from app import _generate_structured, PreenchimentoCompletoResult, TASK_PROMPTS
            print("\n   [Teste Ponta-a-Ponta] Estruturando ficha completa e-SISLA a partir do audio transcrito...")
            instruction = (
                TASK_PROMPTS["preencher_ficha"]
                + "\n\nTEXTO BRUTO FORNECIDO PELO USUÁRIO:\n"
                + texto_fmt
                + "\n\nDECISÃO CLÍNICA/PERICIAL DEFINIDA PELO MÉDICO PERITO NO SISTEMA:\n"
                + "- Parecer definido pelo médico: favoravel\n"
                + "- Avaliação do exame físico pelo perito: alterado\n"
                + "- Dias concedidos pelo médico: 60\n"
            )
            with app.test_request_context("/api/ai/preencher-ficha", method="POST"):
                res_ficha = _generate_structured(instruction, PreenchimentoCompletoResult)
            print(f"   -> CID extraido: {res_ficha.cid}")
            print(f"   -> Cargo extraido: {res_ficha.cargo}")
            print(f"   -> Idade extraida: {res_ficha.idade}")
            print(f"   -> Parecer gerado: {res_ficha.parecer}")
            print(f"   -> Justificativa (resumo): {str(res_ficha.justificativa or '')[:140]}...")
            assert "I21" in (res_ficha.cid or "").upper()
            assert res_ficha.idade == "61"
            ficha_ok = True

        resultados.append({
            "cenario": nome,
            "cartoes": len(dialogo),
            "respondidos": respondidos,
            "pendentes": pendentes,
            "extras": len(extras),
            "total_duvidas": total_duvidas,
            "duvidas_lista": duvidas_lista,
            "ficha_end_to_end": ficha_ok
        })

    Path("relatorio_bateria_avancada.json").write_text(
        json.dumps(resultados, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("\nRelatorio salvo em relatorio_bateria_avancada.json")

if __name__ == "__main__":
    executar_bateria_avancada()
