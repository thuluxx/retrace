const logbox = document.getElementById('logbox');
  const charcount = document.getElementById('charcount');
  const emptyState = document.getElementById('emptyState');
  const verdict = document.getElementById('verdict');
  const causeTag = document.getElementById('causeTag');
  const confidence = document.getElementById('confidence');
  const reason = document.getElementById('reason');

  const API_URL = 'http://localhost:8000/classify';

  const samples = {
    race: `AssertionError: Timed out retrying after 4000ms: expected '#cart-badge' to have text '3'
  at CartPage.assertBadgeCount (cart.spec.ts:58)
  Note: element was still updating when assertion ran. Same test passed on retry #1 with no code changes.`,
    wait: `TimeoutError: waiting for selector "#confirmation-toast" failed: timeout 3000ms exceeded
  at CheckoutFlow.waitForConfirmation (checkout.spec.ts:112)
  cy.wait(3000) precedes this assertion. Runner: ci-runner-04 (shared, avg load 78%).`,
    net: `FetchError: request to https://api.partner-shipping.com/rates failed, reason: connect ETIMEDOUT
  at ShippingWidget.loadRates (shipping.spec.ts:29)
  No mock configured for partner-shipping.com in this test file.`,
    real: `AssertionError: expected 42.00 to equal 45.50
  at CartTotals.calculatesTaxCorrectly (totals.spec.ts:77)
  Tax calculation changed in commit 8f1c2ab (this PR). Reproduced on 5/5 local runs.`
  };

  document.querySelectorAll('.sample-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      logbox.value = samples[btn.dataset.sample];
      updateCount();
      logbox.focus();
    });
  });

  function updateCount(){
    charcount.textContent = logbox.value.length + ' characters';
  }
  logbox.addEventListener('input', updateCount);

  async function classify(text){
    if (!text.trim()) return null;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: text })
    });

    if (!response.ok) {
      throw new Error(`Classification failed (${response.status})`);
    }

    const result = await response.json();

    return {
      cause: result.cause,
      stable: result.cause === 'likely real regression',
      conf: `${Math.round(result.confidence * 100)}% confidence`,
      confRaw: result.confidence,
      reason: result.reasoning,
      // Keep the existing evidence UI useful without adding evidence to the API contract.
      evidenceLines: text.split('\n').filter(Boolean).slice(0, 6)
    };
  }

  function clearMatchedRows(){
    document.querySelectorAll('.cause-row.matched').forEach(r => r.classList.remove('matched'));
  }

  /* ---------- History panel ---------- */
  const historyList = document.getElementById('historyList');
  const historyEmpty = document.getElementById('historyEmpty');
  const historyEntries = [];

  function addToHistory(text, result){
    historyEntries.unshift({
      time: new Date(),
      cause: result.cause,
      stable: result.stable,
      conf: result.conf,
      snippet: text.trim().split('\n')[0].slice(0, 60)
    });
    renderHistory();
  }

  function renderHistory(){
    if (!historyEntries.length){
      historyEmpty.style.display = 'block';
      historyList.innerHTML = '';
      return;
    }
    historyEmpty.style.display = 'none';
    historyList.innerHTML = historyEntries.slice(0, 20).map(entry => {
      const hh = String(entry.time.getHours()).padStart(2, '0');
      const mm = String(entry.time.getMinutes()).padStart(2, '0');
      return `<div class="history-row">
        <span class="history-time">${hh}:${mm}</span>
        <span class="history-cause${entry.stable ? ' stable' : ''}">${entry.cause}</span>
        <span class="history-snippet">${entry.snippet.replace(/</g, '&lt;')}</span>
        <span class="history-conf">${entry.conf.replace(' confidence', '%').replace('%%','%')}</span>
      </div>`;
    }).join('');
  }

  /* ---------- Single-log mode ---------- */
  const skeleton = document.getElementById('skeleton');
  const evidenceToggle = document.getElementById('evidenceToggle');
  const evidenceBox = document.getElementById('evidence');
  const copyBtn = document.getElementById('copyBtn');
  let lastResult = null;

  document.getElementById('classifyBtn').addEventListener('click', async () => {
    const text = logbox.value;

    verdict.classList.remove('show', 'in');
    evidenceBox.classList.remove('show');
    evidenceToggle.textContent = 'Show matched log lines';
    clearMatchedRows();

    if (!text.trim()) {
      emptyState.textContent = 'Paste a log first — there\'s nothing to classify yet.';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    skeleton.classList.add('show');

    const btn = document.getElementById('classifyBtn');
    btn.disabled = true;
    btn.textContent = 'Analyzing…';

    try {
      const result = await classify(text);

      lastResult = result;
      causeTag.textContent = result.cause;
      causeTag.className = 'cause-tag' + (result.stable ? ' stable' : '');
      confidence.textContent = result.conf;
      reason.textContent = result.reason;
      evidenceBox.textContent = result.evidenceLines.join('\n');

      const row = document.querySelector(`.cause-row[data-cause="${result.cause}"]`);
      if (row) row.classList.add('matched');

      verdict.classList.add('show');
      requestAnimationFrame(() => verdict.classList.add('in'));

      addToHistory(text, result);
    } catch (error) {
      emptyState.textContent = 'Could not reach Retrace\'s classifier. Is the backend running on localhost:8000?';
      emptyState.style.display = 'block';
      console.error(error);
    } finally {
      skeleton.classList.remove('show');
      btn.disabled = false;
      btn.textContent = 'Classify failure';
    }
  });

  evidenceToggle.addEventListener('click', () => {
    const isShown = evidenceBox.classList.toggle('show');
    evidenceToggle.textContent = isShown ? 'Hide matched log lines' : 'Show matched log lines';
  });

  copyBtn.addEventListener('click', () => {
    if (!lastResult) return;
    const text = `${lastResult.cause} (${lastResult.conf})\n${lastResult.reason}`;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = 'Copy verdict';
        copyBtn.classList.remove('copied');
      }, 1500);
    });
  });

  /* ---------- File upload (single mode) ---------- */
  const fileInput = document.getElementById('fileInput');
  const uploadFilename = document.getElementById('uploadFilename');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const text = await file.text();
    logbox.value = text;
    updateCount();
    uploadFilename.textContent = file.name;
  });

  /* ---------- Batch mode ---------- */
  const modeToggle = document.getElementById('modeToggle');
  const singleMode = document.getElementById('singleMode');
  const batchMode = document.getElementById('batchMode');
  const demoHeadLabel = document.getElementById('demoHeadLabel');
  const batchbox = document.getElementById('batchbox');
  const batchFileInput = document.getElementById('batchFileInput');
  const batchUploadFilename = document.getElementById('batchUploadFilename');
  const batchClassifyBtn = document.getElementById('batchClassifyBtn');
  const batchProgress = document.getElementById('batchProgress');
  const batchResults = document.getElementById('batchResults');
  let batchFilesText = [];

  modeToggle.addEventListener('click', () => {
    const goingToBatch = !batchMode.classList.contains('hidden') ? false : true;
    if (goingToBatch){
      singleMode.classList.add('hidden');
      batchMode.classList.remove('hidden');
      modeToggle.textContent = 'Switch to single-log mode';
      demoHeadLabel.textContent = 'batch_failures/';
    } else {
      batchMode.classList.add('hidden');
      singleMode.classList.remove('hidden');
      modeToggle.textContent = 'Switch to batch mode';
      demoHeadLabel.textContent = 'failure_log.txt';
    }
  });

  batchFileInput.addEventListener('change', async () => {
    const files = Array.from(batchFileInput.files);
    if (!files.length) return;
    batchFilesText = await Promise.all(files.map(f => f.text()));
    batchUploadFilename.textContent = `${files.length} file(s): ${files.map(f => f.name).join(', ')}`;
  });

  function splitBatchLogs(){
    // Prefer uploaded files if present; otherwise split the textarea on a --- delimiter line.
    if (batchFilesText.length) return batchFilesText;
    return batchbox.value
      .split(/\n\s*---\s*\n/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  batchClassifyBtn.addEventListener('click', async () => {
    const logs = splitBatchLogs();

    if (!logs.length) {
      batchResults.innerHTML = '<p class="verdict-empty">Paste at least one log, or upload files, first.</p>';
      return;
    }

    batchClassifyBtn.disabled = true;
    batchResults.innerHTML = '';

    for (let i = 0; i < logs.length; i++) {
      batchProgress.textContent = `Classifying ${i + 1} of ${logs.length}…`;
      const row = document.createElement('div');
      row.className = 'batch-result-row';
      row.innerHTML = `<div class="batch-result-top"><span class="batch-result-index">#${i + 1}</span><span class="cause-tag">analyzing…</span></div>`;
      batchResults.appendChild(row);

      try {
        const result = await classify(logs[i]);
        row.innerHTML = `
          <div class="batch-result-top">
            <span class="batch-result-index">#${i + 1}</span>
            <span class="cause-tag${result.stable ? ' stable' : ''}">${result.cause}</span>
            <span class="confidence">${result.conf}</span>
          </div>
          <p class="batch-result-reason">${result.reason}</p>`;
        addToHistory(logs[i], result);
      } catch (error) {
        row.classList.add('error');
        row.innerHTML = `
          <div class="batch-result-top">
            <span class="batch-result-index">#${i + 1}</span>
            <span class="cause-tag">error</span>
          </div>
          <p class="batch-result-reason">Could not classify this log. Is the backend running?</p>`;
        console.error(error);
      }
    }

    batchProgress.textContent = `Done — ${logs.length} log(s) classified.`;
    batchClassifyBtn.disabled = false;
  });

  /* One orchestrated reveal: stat numbers count up when scrolled into view */
  const statEls = document.querySelectorAll('.stat-num');
  const statTargets = new Map();
  statEls.forEach(el => statTargets.set(el, el.textContent));
  let statsAnimated = false;

  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !statsAnimated){
        statsAnimated = true;
        statEls.forEach(el => {
          const target = statTargets.get(el);
          const numMatch = target.match(/[\d.]+/);
          if (!numMatch) return;
          const numTarget = parseFloat(numMatch[0]);
          const prefix = target.slice(0, numMatch.index);
          const suffix = target.slice(numMatch.index + numMatch[0].length);
          const isDecimal = numMatch[0].includes('.');
          const duration = 700;
          const startTime = performance.now();
          function step(now){
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = numTarget * eased;
            el.textContent = prefix + (isDecimal ? current.toFixed(1) : Math.round(current)) + suffix;
            if (progress < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
        statObserver.disconnect();
      }
    });
  }, { threshold: 0.6 });

  statEls.forEach(el => statObserver.observe(el));