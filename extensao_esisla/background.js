// Background Service Worker - Ambiental e-SISLA AutoFill (Manifest V3)
// Gerenciador de Fila Inteligente de Atendimentos Multi-Laudos e Sincronização

function applyDisplayMode(mode) {
  const useSidePanel = mode !== 'popup';
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: useSidePanel }).catch(() => {});
  }
  if (chrome.action && chrome.action.setPopup) {
    chrome.action.setPopup({ popup: useSidePanel ? '' : 'popup.html' }).catch(() => {});
  }
}

function initSidePanelBehavior() {
  chrome.storage.local.get(['ambiental_ext_display_mode'], (res) => {
    applyDisplayMode(res.ambiental_ext_display_mode || 'sidepanel');
  });
}

initSidePanelBehavior();

function appendActivityLog(type, title, detail) {
  chrome.storage.local.get(['ambiental_esisla_activity_log'], (res) => {
    const list = Array.isArray(res.ambiental_esisla_activity_log) ? res.ambiental_esisla_activity_log : [];
    list.unshift({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: type || 'info',
      title: title || 'Evento',
      detail: detail || '',
      ts: new Date().toISOString()
    });
    chrome.storage.local.set({ ambiental_esisla_activity_log: list.slice(0, 30) });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  initSidePanelBehavior();
  console.log('[Ambiental e-SISLA] Extensão instalada em modo Side Panel.');
  chrome.storage.local.get(['ambiental_esisla_queue'], (res) => {
    updateBadge(res.ambiental_esisla_queue || []);
  });
});

function updateBadge(queue) {
  const pendingCount = (queue || []).filter(item => item.status !== 'preenchido').length;
  if (pendingCount > 0) {
    chrome.action.setBadgeText({ text: String(pendingCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#00C95A' });
    chrome.action.setTitle({
      title: `Ambiental e-SISLA: ${pendingCount} laudo(s) pendente(s) na fila do dia`
    });
  } else if ((queue || []).length > 0) {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    chrome.action.setTitle({ title: 'Ambiental e-SISLA: Todos os laudos da fila foram preenchidos' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Ambiental ⚡ e-SISLA AutoFill' });
  }
}

// Atualiza o badge do ícone quando houver alterações na fila
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.ambiental_esisla_queue) {
      updateBadge(changes.ambiental_esisla_queue.newValue || []);
    } else if (changes.ambiental_latest_esisla && !changes.ambiental_esisla_queue) {
      const val = changes.ambiental_latest_esisla.newValue;
      if (val && val.protocolo) {
        chrome.action.setBadgeText({ text: '1' });
        chrome.action.setBadgeBackgroundColor({ color: '#00C95A' });
      }
    }
  }
});

// Receptor de mensagens
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Salvar ou Adicionar laudo na Fila Inteligente do Dia
  if (request.action === 'ADICIONAR_FICHA_FILA' || request.action === 'SALVAR_FICHA') {
    chrome.storage.local.get(['ambiental_esisla_queue'], (res) => {
      let queue = Array.isArray(res.ambiental_esisla_queue) ? res.ambiental_esisla_queue : [];
      const novo = {
        ...request.payload,
        status: 'pendente',
        timestamp: request.payload?.timestamp || new Date().toISOString()
      };
      const proto = String(novo.protocolo || '').trim();
      const idx = queue.findIndex(item => String(item.protocolo || '').trim() === proto && proto);
      if (idx !== -1) {
        queue[idx] = novo; // Atualiza laudo existente
      } else {
        queue.unshift(novo); // Insere no início da fila
      }
      if (queue.length > 50) queue = queue.slice(0, 50);

      chrome.storage.local.set({
        ambiental_esisla_queue: queue,
        ambiental_latest_esisla: novo
      }, () => {
        updateBadge(queue);
        appendActivityLog('queue', `Ficha #${proto || 'S/N'} na fila`, novo.servidor || novo.paciente || 'Servidor');
        sendResponse({ status: 'ok', count: queue.length });
      });
    });
    return true;
  }

  // 2. Obter toda a Fila do Dia
  if (request.action === 'OBTER_FILA') {
    chrome.storage.local.get(['ambiental_esisla_queue'], (result) => {
      sendResponse({ fila: Array.isArray(result.ambiental_esisla_queue) ? result.ambiental_esisla_queue : [] });
    });
    return true;
  }

  // 3. Obter Ficha Única (compatibilidade)
  if (request.action === 'OBTER_FICHA') {
    chrome.storage.local.get(['ambiental_latest_esisla', 'ambiental_esisla_queue'], (result) => {
      sendResponse({ 
        payload: result.ambiental_latest_esisla || (result.ambiental_esisla_queue?.[0] || null),
        fila: result.ambiental_esisla_queue || []
      });
    });
    return true;
  }

  // 4. Marcar Ficha como Preenchida no e-SISLA
  if (request.action === 'MARCAR_FICHA_PREENCHIDA') {
    chrome.storage.local.get(['ambiental_esisla_queue'], (res) => {
      let queue = Array.isArray(res.ambiental_esisla_queue) ? res.ambiental_esisla_queue : [];
      const proto = String(request.protocolo || '').trim();
      const nome = String(request.servidor || request.paciente || '').trim().toLowerCase();
      
      queue.forEach(item => {
        const itemProto = String(item.protocolo || '').trim();
        const itemNome = String(item.servidor || item.paciente || '').trim().toLowerCase();
        if ((proto && itemProto === proto) || (nome && itemNome === nome)) {
          item.status = 'preenchido';
          item.preenchido_em = new Date().toISOString();
        }
      });

      chrome.storage.local.set({ ambiental_esisla_queue: queue }, () => {
        updateBadge(queue);
        appendActivityLog('success', `Preenchido no e-SISLA (#${proto || 'S/N'})`, request.servidor || request.paciente || '');
        sendResponse({ status: 'ok' });
      });
    });
    return true;
  }

  // 5. Remover Laudo Específico da Fila
  if (request.action === 'REMOVER_FICHA_FILA') {
    chrome.storage.local.get(['ambiental_esisla_queue'], (res) => {
      let queue = Array.isArray(res.ambiental_esisla_queue) ? res.ambiental_esisla_queue : [];
      queue = queue.filter(item => String(item.protocolo || '').trim() !== String(request.protocolo || '').trim());
      chrome.storage.local.set({ ambiental_esisla_queue: queue }, () => {
        updateBadge(queue);
        appendActivityLog('info', `Removido #${request.protocolo || 'S/N'}`, request.servidor || '');
        sendResponse({ status: 'ok' });
      });
    });
    return true;
  }

  // 6. Limpar Toda a Fila
  if (request.action === 'LIMPAR_FILA' || request.action === 'LIMPAR_FICHA') {
    chrome.storage.local.remove(['ambiental_latest_esisla', 'ambiental_esisla_queue'], () => {
      updateBadge([]);
      appendActivityLog('info', 'Fila do dia limpa', 'Todos os laudos removidos');
      sendResponse({ status: 'ok' });
    });
    return true;
  }

  // 7. Executar Preenchimento na Aba Ativa
  if (request.action === 'PREENCHER_TAB_ATIVA') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) {
        sendResponse({ status: 'error', message: 'Nenhuma aba ativa encontrada.' });
        return;
      }
      const activeTab = tabs[0];
      
      chrome.tabs.sendMessage(activeTab.id, { 
        action: 'EXEC_PREENCHIMENTO', 
        payload: request.payload 
      }, (resp) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id, allFrames: true },
            files: ['content_esisla.js']
          }).then(() => {
            setTimeout(() => {
              chrome.tabs.sendMessage(activeTab.id, { 
                action: 'EXEC_PREENCHIMENTO', 
                payload: request.payload 
              }, (resp2) => {
                sendResponse(resp2 || { status: 'ok' });
              });
            }, 300);
          }).catch(err => {
            sendResponse({ 
              status: 'error', 
              message: 'Não foi possível injetar o script na aba ativa: ' + err.message 
            });
          });
        } else {
          sendResponse(resp || { status: 'ok' });
        }
      });
    });
    return true;
  }

  // 8. Sincronizar Agenda Capturada do e-SISLA com as Abas do Ambiental
  if (request.action === 'AGENDA_ESISLA_CAPTURADA') {
    const qtd = Array.isArray(request.payload?.itens) ? request.payload.itens.length : (Array.isArray(request.payload) ? request.payload.length : 0);
    appendActivityLog('info', 'Agenda e-SISLA capturada', qtd ? `${qtd} registro(s) sincronizado(s)` : 'Sincronizada com o Ambiental');
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        try {
          if (tab.url && (tab.url.includes('localhost') || tab.url.includes('127.0.0.1') || tab.url.includes('gestao') || tab.url.includes('ambiental') || tab.url.includes('vercel.app'))) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'AGENDA_ESISLA_DISPONIVEL',
              payload: request.payload
            }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        } catch(_) {}
      });
    });
    sendResponse({ status: 'ok' });
    return true;
  }

  // 9. Consultar status da aba ativa para o Side Panel
  if (request.action === 'OBTER_STATUS_ABA_ESISLA') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) {
        sendResponse({ ok: false, kind: 'none', title: 'Nenhuma aba ativa', url: '' });
        return;
      }
      const url = String(tab.url || '');
      const title = String(tab.title || 'Sem título');
      const isEsisla = /sisla|sp\.gov\.br|prodesp/i.test(url) || /e-?sisla|dpme/i.test(title);
      const isAmbiental = /localhost|127\.0\.0\.1|gestao|ambiental|vercel\.app/i.test(url);
      const baseResp = {
        ok: true,
        kind: isEsisla ? 'esisla' : (isAmbiental ? 'ambiental' : 'other'),
        screen: 'portal',
        title,
        url,
        tabId: tab.id
      };
      if (isEsisla && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'GET_ESISLA_SCREEN_STATE' }, (screenResp) => {
          if (!chrome.runtime.lastError && screenResp && screenResp.ok) {
            baseResp.screen = screenResp.screen || 'portal';
          }
          sendResponse(baseResp);
        });
      } else {
        sendResponse(baseResp);
      }
    });
    return true;
  }

  // 10. Limpar histórico de atividades do Side Panel
  if (request.action === 'LIMPAR_HISTORICO_LOG') {
    chrome.storage.local.remove(['ambiental_esisla_activity_log'], () => {
      sendResponse({ status: 'ok' });
    });
    return true;
  }

  // 11. Alternar modo de exibição entre Side Panel e Popup normal
  if (request.action === 'SET_DISPLAY_MODE') {
    const mode = request.mode === 'popup' ? 'popup' : 'sidepanel';
    chrome.storage.local.set({ ambiental_ext_display_mode: mode }, () => {
      applyDisplayMode(mode);
      sendResponse({ status: 'ok', mode });
    });
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => {
  initSidePanelBehavior();
});
