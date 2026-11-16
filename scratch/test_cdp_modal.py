import asyncio
import json
import subprocess
import time
import urllib.request
import websockets
import sys

sys.stdout.reconfigure(encoding='utf-8')

async def run_cdp():
    server = subprocess.Popen(['python', '-m', 'http.server', '8098'])
    time.sleep(1)

    chrome_cmd = [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        '--headless=new',
        '--remote-debugging-port=9224',
        '--disable-gpu',
        'http://127.0.0.1:8098/ambiental_avaliacao_medica_lts_cid_assistente.html?modo_ia2=1'
    ]
    chrome = subprocess.Popen(chrome_cmd)
    time.sleep(2)

    try:
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9224/json').read().decode())
        target_tab = None
        for t in tabs:
            if 'ambiental_avaliacao' in t.get('url', ''):
                target_tab = t
                break
        if not target_tab:
            target_tab = tabs[0]

        ws_url = target_tab['webSocketDebuggerUrl']
        print('Connecting to:', ws_url)

        async with websockets.connect(ws_url) as ws:
            msg_id = 0
            async def send_cmd(method, params=None):
                nonlocal msg_id
                msg_id += 1
                payload = {'id': msg_id, 'method': method, 'params': params or {}}
                await ws.send(json.dumps(payload))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get('id') == msg_id:
                        return resp

            await send_cmd('Runtime.enable')

            async def eval_js(expr):
                r = await send_cmd('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
                res_obj = r.get('result', {}).get('result', {})
                if 'value' in res_obj:
                    return res_obj['value']
                return res_obj

            await asyncio.sleep(1)

            # Test 1: Click "Modo Escrita" tab
            res_tab = await eval_js("""
                (function() {
                    const btn = document.getElementById('ia2CardModoEscrita') || document.querySelector('[onclick*="alternarAbaIA2(\\'escrita\\')"]');
                    if (btn) btn.click();
                    return {
                        viewEscritaDisplay: document.getElementById('ia2ViewEscrita')?.style.display,
                        hasTextarea: !!document.getElementById('ia2EscritaText'),
                        hasBtnFinalizar: !!document.getElementById('ia2BtnFinalizarEscrita')
                    };
                })()
            """)
            print('Tab switch result:', res_tab)

            # Test 2: Click Finalizar Atendimento with EMPTY textarea -> MUST open ia2ModalDecisaoMedico!
            res_empty_click = await eval_js("""
                (function() {
                    const ta = document.getElementById('ia2EscritaText');
                    ta.value = "";
                    ta.dispatchEvent(new Event('input'));
                    const btn = document.getElementById('ia2BtnFinalizarEscrita');
                    btn.click();
                    const modal = document.getElementById('ia2ModalDecisaoMedico');
                    return {
                        modalDecisaoDisplay: modal?.style.display,
                        modalDecisaoHasShow: modal?.classList.contains('show'),
                        modalDecisaoAriaHidden: modal?.getAttribute('aria-hidden')
                    };
                })()
            """)
            print('Test 2 - Click Finalizar with EMPTY text -> Decisao modal result:', res_empty_click)

            # Close modal
            await eval_js("fecharModalDecisaoMedicoIA2()")

            # Test 3: Click Finalizar Atendimento with CLINICAL text -> MUST open ia2ModalDecisaoMedico!
            res_text_click = await eval_js("""
                (function() {
                    const ta = document.getElementById('ia2EscritaText');
                    ta.value = "Paciente com lombalgia aguda M54.5, necessita de 3 dias de repouso.";
                    ta.dispatchEvent(new Event('input'));
                    const btn = document.getElementById('ia2BtnFinalizarEscrita');
                    btn.click();
                    const modal = document.getElementById('ia2ModalDecisaoMedico');
                    return {
                        modalDecisaoDisplay: modal?.style.display,
                        modalDecisaoHasShow: modal?.classList.contains('show'),
                        modalDecisaoAriaHidden: modal?.getAttribute('aria-hidden'),
                        diasOriginalTexto: document.getElementById('ia2DecisaoDiasOriginalTexto')?.textContent
                    };
                })()
            """)
            print('Test 3 - Click Finalizar with CLINICAL text -> Decisao modal result:', res_text_click)

            # Test 4: In modal decisao, click Confirmar Decisão e Estruturar com IA -> Loading overlay opens
            res_confirm = await eval_js("""
                (function() {
                    const btnConfirm = document.querySelector('[onclick*=\"confirmarDecisaoEEstruturarIA2\"]');
                    if (btnConfirm) btnConfirm.click();
                    const loading = document.getElementById('ia2LoadingOverlay');
                    const modal = document.getElementById('ia2ModalDecisaoMedico');
                    return {
                        loadingOverlayDisplay: loading?.style.display,
                        modalDecisaoDisplay: modal?.style.display
                    };
                })()
            """)
            print('Test 4 - Confirmar Decisao -> Loading overlay result:', res_confirm)

    finally:
        chrome.terminate()
        server.terminate()

asyncio.run(run_cdp())
