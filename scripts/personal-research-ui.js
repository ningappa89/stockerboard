(function (root) {
    'use strict';

    const Account = root.StockerboardAccount;
    const Contract = root.StockerboardPersonalContract;
    const Storage = root.StockerboardPersonalStorage;

    let _mounted = false;
    let _unsavedDraftText = '';
    let _activePanel = null; // 'watchlist' | 'notes' | 'settings' | 'legacy'
    let _editingNote = null;
    let _ownerKey = null;
    let _draft = {symbol:'',title:'',body:''};
    let _formMessage = '';
    let _opener = null;

    function el(tag, attrs, text) {
        const node = document.createElement(tag);
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                if (k === 'className') node.className = v;
                else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
                else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
            }
        }
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function escapeHtmlSafeStatus(status) {
        const map = {
            LOCAL: 'Local',
            LOADING: 'Loading',
            SAVING: 'Saving',
            SAVED: 'Saved',
            SYNCED: 'Synced',
            UNSAVED: 'Unsaved',
            CONFLICT: 'Conflict',
            UNAVAILABLE: 'Unavailable',
        };
        return map[status] || 'Local';
    }

    function ensureDrawer() {
        let drawer = document.getElementById('sbPersonalDrawer');
        if (drawer) return drawer;
        drawer = el('aside', {
            id: 'sbPersonalDrawer',
            className: 'sb-pr-drawer',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'sbPrDrawerTitle',
            hidden: 'hidden',
        });
        document.body.appendChild(drawer);
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Tab' && !drawer.hidden) {
                const nodes=[...drawer.querySelectorAll('button,input,textarea,a[href]')].filter(n=>!n.disabled);
                const first=nodes[0],last=nodes[nodes.length-1];
                if(ev.shiftKey && document.activeElement===first){ev.preventDefault();last?.focus();}
                else if(!ev.shiftKey && document.activeElement===last){ev.preventDefault();first?.focus();}
            }
            if (ev.key === 'Escape' && !drawer.hidden) {
                closeDrawer();
            }
        });
        return drawer;
    }

    function closeDrawer() {
        const drawer = document.getElementById('sbPersonalDrawer');
        if (drawer) {
            drawer.hidden = true;
            drawer.replaceChildren();
        }
        _activePanel = null;
        if (_opener && _opener.isConnected) _opener.focus();
    }

    function openDrawer(panel) {
        _opener = document.activeElement;
        _activePanel = panel;
        renderDrawer(Account ? Account.getSnapshot() : null);
    }

    function renderDrawer(snap) {
        if (!_activePanel || !snap) return;
        const focused = document.activeElement;
        const focusLabel = focused?.getAttribute('aria-label');
        const selection = focused?.selectionStart;
        const drawer = ensureDrawer();
        drawer.hidden = false;
        drawer.replaceChildren();

        const header = el('div', { className: 'sb-pr-header' });
        const titleMap = {
            watchlist: 'Personal Watchlist',
            notes: 'Private Research Notes',
            settings: 'Account & Privacy Settings',
            legacy: 'Import Previous Browser Watchlist',
        };
        header.append(
            el('h2', { id: 'sbPrDrawerTitle', className: 'sb-pr-title' }, titleMap[_activePanel] || 'Personal Research'),
            el('button', { type: 'button', className: 'sb-pr-close', 'aria-label': 'Close panel', onClick: closeDrawer }, '✕')
        );
        drawer.append(header);

        const body = el('div', { className: 'sb-pr-body' });

        if (snap.user) {
            const acctBar = el('div', { className: 'sb-pr-account-bar' });
            acctBar.append(
                el('span', { className: 'sb-pr-account-email' }, snap.user.email || snap.user.uid),
                el('span', { className: `sb-pr-status sb-pr-status-${snap.syncStatus.toLowerCase()}`, role: 'status', 'aria-live': 'polite' }, escapeHtmlSafeStatus(snap.syncStatus))
            );
            body.append(acctBar);
        }

        if (_activePanel === 'legacy' && snap.legacyPreview) {
            renderLegacyPanel(body, snap);
        } else if (_activePanel === 'notes') {
            renderNotesPanel(body, snap);
        } else if (_activePanel === 'settings') {
            renderSettingsPanel(body, snap);
        } else {
            renderWatchlistPanel(body, snap);
        }

        drawer.append(body);
        const restore = focusLabel && [...drawer.querySelectorAll('[aria-label]')].find(n => n.getAttribute('aria-label') === focusLabel);
        if (restore) {restore.focus(); if (typeof selection === 'number' && restore.setSelectionRange) restore.setSelectionRange(selection,selection);}
    }

    function renderWatchlistPanel(body, snap) {
        const notice = el('p', { className: 'sb-pr-muted' },
            snap.user
                ? 'Watchlist entries are stored in your private account (up to 500 issuers). Market and valuation numbers come from shared certified Stockerboard releases.'
                : 'Guest watchlist stores up to 3 companies on this browser only.'
        );
        body.append(notice);

        if (!snap.watchlist.length) {
            body.append(el('div', { className: 'sb-pr-empty' }, 'No companies in your watchlist yet. Add a company from search or any company research page.'));
            return;
        }

        const ul = el('ul', { className: 'sb-pr-list' });
        for (const item of snap.watchlist) {
            const li = el('li', { className: 'sb-pr-list-item' });
            const info = el('div', { className: 'sb-pr-item-meta' });
            info.append(
                el('a', { href: `/stockerboard_company_overview.html?symbol=${encodeURIComponent(item.symbol)}`, className: 'sb-pr-symbol-link' }, item.symbol),
                el('small', { className: 'sb-pr-muted' }, item.companyId ? `Issuer ${item.companyId}` : 'Unresolved issuer reference')
            );
            const removeBtn = el('button', {
                type: 'button',
                className: 'sb-pr-btn-secondary',
                'aria-label': `Remove ${item.symbol} from watchlist`,
                onClick: async () => {
                    if (Account) await Account.toggleWatchlistSymbol(item.symbol);
                },
            }, 'Remove');
            li.append(info, removeBtn);
            ul.append(li);
        }
        body.append(ul);
    }

    function renderNotesPanel(body, snap) {
        if (!snap.user) {
            body.append(el('div', { className: 'sb-pr-empty' }, 'Sign in to save private plain-text notes linked to companies.'));
            return;
        }

        body.append(el('p', { className: 'sb-pr-muted' }, 'Private notes are visible only to this account. They are separate from the local Decision Journal on this device.'));

        const activeSymbol = getCurrentCompanySymbol();
        const form = el('form', { className: 'sb-pr-note-form' });
        const symInput = el('input', {
            type: 'text',
            className: 'sb-pr-input',
            placeholder: 'Symbol (e.g. TCS)',
            maxlength: '40',
            value: _draft.symbol || activeSymbol || '',
            'aria-label': 'Company symbol',
        });
        const titleInput = el('input', {
            type: 'text',
            className: 'sb-pr-input',
            placeholder: 'Note title (plain text, max 160 chars)',
            maxlength: '160',
            value: _draft.title || '',
            'aria-label': 'Note title',
        });
        const bodyInput = el('textarea', {
            className: 'sb-pr-textarea',
            placeholder: 'Plain-text research notes (max 8 KiB)...',
            rows: '5',
            'aria-label': 'Note body',
        });
        bodyInput.value = _draft.body || '';
        symInput.addEventListener('input', () => {_draft.symbol = symInput.value;});
        titleInput.addEventListener('input', () => {_draft.title = titleInput.value;});
        bodyInput.addEventListener('input', () => {
            _unsavedDraftText = bodyInput.value; _draft.body = bodyInput.value;
        });

        const msgBox = el('div', { className: 'sb-pr-form-msg', role: 'status', 'aria-live': 'polite' }, _formMessage);
        const btnRow = el('div', { className: 'sb-pr-actions' });
        const saveBtn = el('button', { type: 'submit', className: 'sb-pr-btn-primary' }, _editingNote ? 'Update Note' : 'Save Private Note');
        const copyBtn = el('button', {
            type: 'button',
            className: 'sb-pr-btn-secondary',
            onClick: async () => {
                try {
                    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
                    await navigator.clipboard.writeText(`${_draft.title}\n\n${_draft.body}`);
                    msgBox.textContent = 'Draft copied to clipboard.';
                } catch (_) {msgBox.textContent = 'Copy unavailable. Select and copy the draft manually.';}
            },
        }, 'Copy draft');
        btnRow.append(saveBtn, copyBtn);

        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const owner = _ownerKey, gen = Account.getSessionGeneration();
            _formMessage = 'Saving...';
            const capturedDraft = {..._draft};
            const res = await Account.saveNote({
                noteId: _editingNote ? _editingNote.noteId : null,
                symbol: capturedDraft.symbol || symInput.value,
                title: capturedDraft.title,
                body: capturedDraft.body,
            });
            if (owner !== _ownerKey || gen !== Account.getSessionGeneration()) return;
            if (res.ok) {
                _draft = {symbol:'',title:'',body:''};
                _unsavedDraftText = '';
                _editingNote = null;
                _formMessage = 'Saved.';
            } else {
                _formMessage = `Unsaved (${res.message || res.code}). Retry Save or Copy draft.`;
            }
            renderDrawer(Account.getSnapshot());
        });

        form.append(symInput, titleInput, bodyInput, msgBox, btnRow);
        body.append(form);

        const list = el('div', { className: 'sb-pr-notes-list' });
        if (!snap.notes.length) {
            list.append(el('div', { className: 'sb-pr-empty' }, 'No saved private notes yet.'));
        } else {
            for (const note of snap.notes) {
                const card = el('article', { className: 'sb-pr-note-card' });
                card.append(
                    el('div', { className: 'sb-pr-note-head' }, `${note.symbol || 'GENERAL'} · ${note.title}`),
                    el('pre', { className: 'sb-pr-note-body' }, note.body), // strict plain text, never innerHTML
                    el('div', { className: 'sb-pr-actions' }, '')
                );
                const actions = card.lastChild;
                actions.append(
                    el('button', {
                        type: 'button',
                        className: 'sb-pr-btn-secondary',
                        onClick: () => { _editingNote = note; _draft = {symbol:note.symbol||'',title:note.title,body:note.body}; _unsavedDraftText = note.body; renderDrawer(Account.getSnapshot()); },
                    }, 'Edit'),
                    el('button', {
                        type: 'button',
                        className: 'sb-pr-btn-danger',
                        onClick: async () => { await Account.deleteNote(note.noteId); },
                    }, 'Delete')
                );
                list.append(card);
            }
        }
        body.append(list);
    }

    function renderLegacyPanel(body, snap) {
        const lp = snap.legacyPreview;
        body.append(
            el('p', { className: 'sb-pr-muted' }, `This browser contains a prior unscoped watchlist (${lp.items.length} item(s)). On a shared device it may belong to another user. Nothing is imported automatically.`),
            el('div', { className: 'sb-pr-legacy-preview' }, lp.items.join(', ') || lp.error || 'Malformed data')
        );
        const actions = el('div', { className: 'sb-pr-actions' });
        if (lp.status === 'AVAILABLE' && lp.items.length) {
            actions.append(el('button', {
                type: 'button',
                className: 'sb-pr-btn-primary',
                onClick: async () => {
                    try { await Account.importLegacySelected(lp.items); openDrawer('watchlist'); }
                    catch (err) { body.append(el('p', {role:'alert'}, 'Import failed: ' + (err.code || err.message))); }
                },
            }, `Import ${lp.items.length} selected companies`));
        }
        actions.append(el('button', {
            type: 'button',
            className: 'sb-pr-btn-secondary',
            onClick: () => {
                Account.skipLegacyImport();
                closeDrawer();
            },
        }, 'Skip'));
        body.append(actions);
    }

    function renderSettingsPanel(body, snap) {
        if (!snap.user) {
            body.append(el('p', { className: 'sb-pr-muted' }, 'Signed out. Using local guest storage.'));
            if (snap.mode === 'EMULATOR') {
                const form = el('form');
                const email = el('input', {type:'email','aria-label':'Demo email',placeholder:'Synthetic email',required:'required'});
                const password = el('input', {type:'password','aria-label':'Demo password',placeholder:'Synthetic password',required:'required'});
                const message = el('p', {role:'status'});
                form.append(email,password,el('button',{type:'submit'},'Sign in to local demo'),message);
                form.addEventListener('submit', async ev => {ev.preventDefault();try {await Account.signInWithEmailPassword(email.value,password.value);}catch(err){message.textContent=err.code||'Sign-in failed';}});
                body.append(form);
            }
            return;
        }
        body.append(
            el('p', { className: 'sb-pr-muted' }, 'Cloud account data (watchlist & private notes) is separate from your local Decision Journal stored only on this browser.'),
            el('div', { className: 'sb-pr-actions' }, '')
        );
        const actions = body.lastChild;
        const msg = el('div', { className: 'sb-pr-form-msg', role: 'status' }, '');
        if (snap.lastError) msg.textContent = snap.syncMessage + ' (' + snap.lastError + ')';

        actions.append(
            el('button', {
                type: 'button',
                className: 'sb-pr-btn-primary',
                onClick: async () => {
                    try {
                        const data = await Account.exportAccountData();
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = el('a', { href: url, download: `stockerboard-account-export-${new Date().toISOString().slice(0, 10)}.json` });
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                        msg.textContent = 'Account export downloaded.';
                    } catch (err) {
                        msg.textContent = `Export failed: ${err.message || err.code}`;
                    }
                },
            }, 'Export Account JSON'),
            el('button', {
                type: 'button',
                className: 'sb-pr-btn-danger',
                onClick: async () => {
                    if (!root.confirm('Clear cloud research data? Your watchlist and private notes will be removed from the cloud; your Firebase Auth identity and local Decision Journal on this device remain.')) return;
                    try {const result=await Account.deleteAccount({ mode: 'CLEAR_CLOUD_DATA' }); if(result.code!=='STALE_SESSION_DISCARDED')closeDrawer();} catch(err) {msg.textContent = 'Clear failed. Retry this action: ' + (err.code || err.message);}
                },
            }, 'Clear cloud research data'),
            el('button', {
                type: 'button',
                className: 'sb-pr-btn-danger',
                onClick: async () => {
                    if (!root.confirm('Delete account permanently? All cloud research data AND your Auth identity will be removed. The local Decision Journal on this device is separate and untouched.')) return;
                    try {const result=await Account.deleteAccount({ mode: 'DELETE_ACCOUNT' }); if(result.code!=='STALE_SESSION_DISCARDED')closeDrawer();} catch(err) {msg.textContent = 'Delete failed. Retry this action: ' + (err.code || err.message);}
                },
            }, 'Delete account')
        );
        if (String(snap.lastError || '').includes('CLEARED')) actions.append(el('button', {type:'button', onClick:async()=>{await Account.startFresh();}}, 'Start fresh'));
        actions.append(el('button', {type:'button',onClick:async()=>{if(root.StockerboardPersonalUI.confirmDiscardDraft()) await Account.signOut();}}, 'Sign out'));
        body.append(msg);
    }

    function getCurrentCompanySymbol() {
        const main = document.querySelector('main[data-research-company]');
        if (main && main.getAttribute('data-symbol')) return main.getAttribute('data-symbol');
        const p = new URLSearchParams(root.location.search);
        return (p.get('symbol') || '').toUpperCase();
    }

    function syncCompanyButtons(snap) {
        const sym = getCurrentCompanySymbol();
        const btnWl = document.getElementById('btnWatchlist');
        if (btnWl && sym) {
            const watched = snap.watchlistSymbols.includes(sym);
            btnWl.textContent = watched ? '✓ Saved' : '+ Watchlist';
            btnWl.classList.toggle('active', watched);
            btnWl.classList.toggle('in-watchlist', watched);
            btnWl.setAttribute('aria-pressed', String(watched));
        }
    }

    function syncHeaderControls(snap) {
        const signinBtn = document.getElementById('gSigninBtn');
        const userChip = document.getElementById('userChip');
        const userName = document.getElementById('userName');
        const dropdownEmail = document.getElementById('dropdownEmail');
        const dropdownWatchCount = document.getElementById('dropdownWatchCount');
        const badge = document.getElementById('syncBadge');

        if (snap.user) {
            if (signinBtn) signinBtn.style.display = 'none';
            if (userChip) userChip.style.display = 'inline-flex';
            if (userName) userName.textContent = (snap.user.displayName || snap.user.email || 'Account').split(' ')[0];
            if (dropdownEmail) dropdownEmail.textContent = snap.user.email || snap.user.uid;
        } else {
            if (signinBtn) signinBtn.style.display = 'inline-flex';
            if (userChip) userChip.style.display = 'none';
        }
        if (dropdownWatchCount) {
            dropdownWatchCount.textContent = `${snap.watchlistSymbols.length} scrips`;
        }
        if (badge) {
            badge.className = `sync-badge sb-pr-status-${snap.syncStatus.toLowerCase()}`;
            badge.textContent = escapeHtmlSafeStatus(snap.syncStatus);
            badge.setAttribute('aria-label', snap.syncMessage || escapeHtmlSafeStatus(snap.syncStatus));
        }

        // Show compact legacy import banner trigger if unresolved legacy list exists
        let legacyPill = document.getElementById('sbLegacyImportTrigger');
        if (snap.user && snap.legacyPreview && !legacyPill) {
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) {
                legacyPill = el('button', {
                    id: 'sbLegacyImportTrigger',
                    type: 'button',
                    className: 'dropdown-item sb-pr-legacy-btn',
                    onClick: () => openDrawer('legacy'),
                }, `Import browser watchlist (${snap.legacyPreview.items.length})`);
                dropdown.prepend(legacyPill);
            }
        } else if ((!snap.user || !snap.legacyPreview) && legacyPill) {
            legacyPill.remove();
        }
    }

    function mount() {
        if (_mounted || !Account || typeof document === 'undefined') return;
        _mounted = true;

        Account.subscribe((snap) => {
            const owner = snap.user ? snap.user.uid + ':' + snap.accountEpoch : null;
            if (owner !== _ownerKey) {_ownerKey = owner; _draft = {symbol:'',title:'',body:''}; _unsavedDraftText=''; _editingNote=null; _formMessage='';}
            syncCompanyButtons(snap);
            syncHeaderControls(snap);
            if (_activePanel) renderDrawer(snap);
            if (typeof root.updateWatchlistUI === 'function') {
                try { root.updateWatchlistUI(); } catch (_) {}
            }
            if (typeof root.renderWatchlistTable === 'function') {
                try { root.renderWatchlistTable(); } catch (_) {}
            }
        });

        // Wire company page watchlist button through the single Account facade
        const btnWl = document.getElementById('btnWatchlist');
        if (btnWl) {
            btnWl.onclick = async () => {
                const sym = getCurrentCompanySymbol();
                if (!sym) return;
                const res = await Account.toggleWatchlistSymbol(sym);
                if (!res.ok && res.code === 'GUEST_LIMIT_REACHED') {
                    if (typeof root.openWatchlistLimitModal === 'function') root.openWatchlistLimitModal(sym);
                    else openDrawer('watchlist');
                }
            };
        }

        // Inject Private Notes button next to Watchlist on company pages
        const actionBox = document.querySelector('.hero-action-buttons');
        if (actionBox && !document.getElementById('btnPrivateNotes')) {
            actionBox.append(el('button', {
                id: 'btnPrivateNotes',
                type: 'button',
                className: 'sb-pr-btn-secondary',
                onClick: () => openDrawer('notes'),
            }, 'Private Note'));
        }

        // Wire dropdown menu shortcuts if header exists
        if (!document.getElementById('sbPersonalAccountButton')) {
            const host = document.querySelector('.header-actions, .nav-actions, .header-controls, .header-right') || document.body;
            host.append(el('button', {id:'sbPersonalAccountButton',type:'button',className:'sb-pr-btn-secondary',onClick:()=>openDrawer('settings')}, 'Research account'));
        }
        const dropdown = document.getElementById('userDropdown');
        if (dropdown && !document.getElementById('sbMenuNotesBtn')) {
            const signoutBtn = dropdown.querySelector('.dropdown-btn-signout');
            const makeItem = (id, label, panel) => el('button', {
                id,
                type: 'button',
                className: 'sb-pr-menu-btn',
                onClick: () => {
                    dropdown.classList.remove('active');
                    openDrawer(panel);
                },
            }, label);
            dropdown.insertBefore(makeItem('sbMenuWatchlistBtn', 'Watchlist', 'watchlist'), signoutBtn);
            dropdown.insertBefore(makeItem('sbMenuNotesBtn', 'Private notes', 'notes'), signoutBtn);
            dropdown.insertBefore(makeItem('sbMenuSettingsBtn', 'Settings / Export / Delete', 'settings'), signoutBtn);
        }
    }

    root.StockerboardPersonalUI = {
        mount,
        openDrawer,
        closeDrawer,
        hasUnsavedDraft: () => Boolean(_draft.title.trim() || _draft.body.trim()),
        confirmDiscardDraft: () => {
            if (!(_draft.title.trim() || _draft.body.trim())) return true;
            if (!root.confirm('You have an unsaved private draft. Cancel to save or copy it, or confirm to discard it and sign out.')) return false;
            _draft={symbol:'',title:'',body:''};_unsavedDraftText='';_editingNote=null;return true;
        },
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
        else mount();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
