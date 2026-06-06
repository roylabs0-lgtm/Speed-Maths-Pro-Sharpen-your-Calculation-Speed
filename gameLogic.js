(function () {
    "use strict";

    // Constants
    const STORAGE_KEY = "speedMathsPro_v2";
    const SOUND_STORAGE_KEY = "speedMathsPro_sound";
    const QUESTIONS_PER_LEVEL = 15;
    const QUESTION_TIME_SEC = 15;
    const MAX_LEVEL = 1000;
    const LIFELINES_PER_LEVEL = 2;
    const TIMER_CIRCUMFERENCE = 2 * Math.PI * 32;

    // DOM Elements
    const menuButtons = document.getElementById("menu-buttons");
    const menuHighest = document.getElementById("menu-highest");
    const menuSubtitle = document.getElementById("menu-subtitle");
    const gameScreen = document.getElementById("game-screen");
    const hudLevel = document.getElementById("hud-level");
    const hudProgress = document.getElementById("hud-progress");
    const hudScore = document.getElementById("hud-score");
    const equationEl = document.getElementById("equation");
    const timerDisplay = document.getElementById("timer-display");
    const timerRing = document.getElementById("timer-ring");
    const redFlash = document.getElementById("red-flash");
    const pauseBtn = document.getElementById("pause-btn");
    const soundBtn = document.getElementById("sound-btn");
    const pauseModal = document.getElementById("pause-modal");
    const levelCompleteModal = document.getElementById("level-complete-modal");
    const levelFailedModal = document.getElementById("level-failed-modal");
    const maxLevelModal = document.getElementById("max-level-modal");
    const levelCompleteDesc = document.getElementById("level-complete-desc");
    const levelFailedDesc = document.getElementById("level-failed-desc");
    const optionButtons = Array.from(document.querySelectorAll(".btn-core"));

    // Game Variables
    let currentLevel = 1;
    let correctInLevel = 0;
    let sessionScore = 0;
    let lifelines = LIFELINES_PER_LEVEL;
    let rightAnswer = 0;
    let timerRemaining = QUESTION_TIME_SEC;
    let timerInterval = null;
    let inputLocked = false;
    let highestLevelReached = 1;
    let isPaused = false;
    let lastFailReason = "lifelines";

    // Audio State
    let audioCtx = null;
    let isSoundEnabled = true;

    // Load sound configuration
    try {
        const soundPref = localStorage.getItem(SOUND_STORAGE_KEY);
        isSoundEnabled = soundPref === null ? true : soundPref === "true";
    } catch (e) {
        isSoundEnabled = true;
    }

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx && audioCtx.state === "suspended") {
            audioCtx.resume();
        }
    }

    function toggleSound() {
        isSoundEnabled = !isSoundEnabled;
        try {
            localStorage.setItem(SOUND_STORAGE_KEY, String(isSoundEnabled));
        } catch (e) {}
        updateSoundButtonUI();
        initAudio();
        if (isSoundEnabled) {
            playSound("tick");
        }
    }

    function updateSoundButtonUI() {
        if (soundBtn) {
            soundBtn.textContent = isSoundEnabled ? "🔊" : "🔇";
        }
    }

    // Audio Synthesizer Cues
    function playSound(type) {
        if (!isSoundEnabled) return;
        try {
            initAudio();
            if (!audioCtx) return;

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            const now = audioCtx.currentTime;

            if (type === "correct") {
                // High-pitch dual chime
                osc.type = "sine";
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.start(now);
                osc.stop(now + 0.22);
            } else if (type === "wrong") {
                // Buzzer / descending sound
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(160, now);
                osc.frequency.linearRampToValueAtTime(90, now + 0.25);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
            } else if (type === "complete") {
                // Triumphant arpeggio
                osc.type = "triangle";
                osc.frequency.setValueAtTime(261.63, now); // C4
                osc.frequency.setValueAtTime(329.63, now + 0.08); // E4
                osc.frequency.setValueAtTime(392.00, now + 0.16); // G4
                osc.frequency.setValueAtTime(523.25, now + 0.24); // C5
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
            } else if (type === "tick") {
                // Short timer beep
                osc.type = "sine";
                osc.frequency.setValueAtTime(750, now);
                gain.gain.setValueAtTime(0.04, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            }
        } catch (e) {
            console.warn("AudioContext error: ", e);
        }
    }

    // Helper functions
    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

    function isBlockingModalOpen() {
        return levelCompleteModal.classList.contains("active") ||
            levelFailedModal.classList.contains("active") ||
            maxLevelModal.classList.contains("active") ||
            document.getElementById("ad-simulator-modal").classList.contains("active");
    }

    function loadStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return data && typeof data === "object" ? data : null;
        } catch (e) { return null; }
    }

    // Save state to local storage
    function saveProgress() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                level: currentLevel,
                correctInLevel: correctInLevel,
                lifelines: lifelines,
                sessionScore: sessionScore,
                highestLevelReached: highestLevelReached
            }));
        } catch (e) {}
    }

    function clearSavedProgress() {
        const stored = loadStorage();
        highestLevelReached = stored && stored.highestLevelReached ? Math.max(1, stored.highestLevelReached) : highestLevelReached;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                level: 1, correctInLevel: 0, lifelines: LIFELINES_PER_LEVEL,
                sessionScore: 0, highestLevelReached: highestLevelReached
            }));
        } catch (e) {}
    }

    function showScreen(id) {
        document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
        document.getElementById(id).classList.add("active");
    }

    function openModal(el) { el.classList.add("active"); }
    function closeModal(el) { el.classList.remove("active"); }

    function closeAllModals() {
        [pauseModal, levelCompleteModal, levelFailedModal, maxLevelModal, document.getElementById("ad-simulator-modal")].forEach(closeModal);
        isPaused = false;
        timerRing.classList.remove("frozen");
        updatePauseButtonState();
    }

    function updatePauseButtonState() {
        const canPause = gameScreen.classList.contains("active") && !isPaused && !inputLocked && !isBlockingModalOpen();
        pauseBtn.disabled = !canPause;
    }

    function updateHeartsUI() {
        for (let i = 1; i <= LIFELINES_PER_LEVEL; i++) {
            document.getElementById("heart-" + i).classList.toggle("lost", i > lifelines);
        }
    }

    function updateHud() {
        hudLevel.textContent = String(currentLevel);
        hudProgress.textContent = correctInLevel + "/" + QUESTIONS_PER_LEVEL;
        hudScore.textContent = String(sessionScore);
        menuHighest.textContent = String(highestLevelReached);
    }

    function setTimerRing(remaining) {
        const ratio = remaining / QUESTION_TIME_SEC;
        timerRing.style.strokeDasharray = String(TIMER_CIRCUMFERENCE);
        timerRing.style.strokeDashoffset = String(TIMER_CIRCUMFERENCE * (1 - ratio));
        timerDisplay.textContent = String(remaining);
        timerRing.classList.remove("safe", "warn", "danger");
        if (remaining > 8) {
            timerRing.classList.add("safe");
        } else if (remaining > 4) {
            timerRing.classList.add("warn");
        } else {
            timerRing.classList.add("danger");
        }
    }

    function stopTimer() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    function startTimerTicking() {
        if (isPaused || isBlockingModalOpen()) return;
        stopTimer();
        timerInterval = setInterval(function () {
            if (isPaused) return;
            timerRemaining -= 1;

            if (timerRemaining <= 5 && timerRemaining > 0) {
                playSound("tick");
            }

            if (timerRemaining <= 0) {
                timerRemaining = 0;
                setTimerRing(0);
                stopTimer();
                handleTimeOut();
                return;
            }
            setTimerRing(timerRemaining);
        }, 1000);
    }

    function startQuestionTimer() {
        stopTimer();
        timerRemaining = QUESTION_TIME_SEC;
        setTimerRing(timerRemaining);
        if (!isPaused) startTimerTicking();
    }

    function pauseGame() {
        if (isPaused || inputLocked || isBlockingModalOpen() || !gameScreen.classList.contains("active")) return;
        isPaused = true;
        stopTimer();
        timerRing.classList.add("frozen");
        optionButtons.forEach(function (btn) { btn.classList.add("locked"); });
        openModal(pauseModal);
        updatePauseButtonState();
        saveProgress();
    }

    function resumeGame() {
        if (!isPaused) return;
        isPaused = false;
        closeModal(pauseModal);
        timerRing.classList.remove("frozen");
        if (!inputLocked && !isBlockingModalOpen()) {
            optionButtons.forEach(function (btn) { btn.classList.remove("locked"); });
            setTimerRing(timerRemaining);
            startTimerTicking();
        }
        updatePauseButtonState();
    }

    function exitToMainMenu() {
        isPaused = false;
        stopTimer();
        closeAllModals();
        inputLocked = false;
        optionButtons.forEach(function (btn) { btn.classList.remove("state-correct", "state-wrong", "locked"); });
        saveProgress();
        buildMainMenu();
        try {
            history.pushState({ page: "menu" }, "");
        } catch(e) {}
    }

    function flashRed() {
        redFlash.classList.add("active");
        setTimeout(function () { redFlash.classList.remove("active"); }, 200);
    }

    function burstFx(x, y) {
        const colors = ["#38bdf8", "#818cf8", "#34d399", "#f472b6", "#fbbf24"];
        for (let i = 0; i < 14; i++) {
            const p = document.createElement("div");
            p.className = "fx-particle";
            const size = randInt(5, 10);
            p.style.width = size + "px";
            p.style.height = size + "px";
            p.style.left = x + "px";
            p.style.top = y + "px";
            p.style.background = pick(colors);
            p.style.setProperty("--x", randInt(-100, 100) + "px");
            p.style.setProperty("--y", randInt(-100, 100) + "px");
            document.body.appendChild(p);
            setTimeout(function () { p.remove(); }, 520);
        }
    }

    // Arithmetic Generation Logic
    function generateQuestion(level) {
        const lvl = clamp(level, 1, MAX_LEVEL);
        const t = (lvl - 1) / (MAX_LEVEL - 1);

        function getLimits(simple) {
            let opMax;
            if (lvl === 1) {
                opMax = 10;
            } else if (lvl <= 10) {
                opMax = Math.round(10 + (lvl - 1) * (40 / 9));
            } else if (lvl <= 50) {
                opMax = Math.round(50 + (lvl - 11) * (49 / 39));
            } else if (lvl <= 100) {
                opMax = 99;
            } else {
                opMax = Math.round(99 + (lvl - 100) * (900 / 900));
            }
            opMax = clamp(opMax, 1, 999);
            if (lvl < 100) opMax = Math.min(opMax, 99);
            if (simple) opMax = Math.min(opMax, lvl <= 10 ? 10 : 20);

            const ansMax = lvl <= 300
                ? 100
                : clamp(Math.round(100 + (lvl - 300) * (899 / 700)), 100, 999);

            let mulCap;
            if (lvl <= 10) mulCap = clamp(4 + lvl, 5, 9);
            else if (lvl <= 50) mulCap = clamp(9 + Math.floor((lvl - 10) / 5), 9, 12);
            else if (lvl < 100) mulCap = 15;
            else mulCap = clamp(12 + Math.floor((lvl - 100) / 40), 12, 99);
            if (lvl < 100) mulCap = Math.min(mulCap, 99);

            let divCap;
            if (lvl <= 10) divCap = 9;
            else if (lvl <= 50) divCap = 12;
            else if (lvl < 100) divCap = 15;
            else divCap = clamp(12 + Math.floor((lvl - 100) / 35), 12, 99);
            if (lvl < 100) divCap = Math.min(divCap, 99);

            return { opMax, ansMax, mulCap, divCap, mixSizes: lvl >= 11 && lvl <= 50 };
        }

        function pickOperands(maxVal, mixSizes) {
            if (!mixSizes || maxVal <= 10) {
                const a = randInt(1, maxVal);
                const b = randInt(1, maxVal);
                return [a, b];
            }
            if (Math.random() < 0.55) {
                const small = randInt(1, 9);
                const big = randInt(clamp(10, 1, maxVal), maxVal);
                return Math.random() < 0.5 ? [small, big] : [big, small];
            }
            return [randInt(1, maxVal), randInt(1, maxVal)];
        }

        function pickOperation() {
            const bounce = 0.05 + Math.random() * 0.05;
            if (Math.random() < bounce) {
                return { type: Math.random() < 0.5 ? "add" : "subtract", simple: true };
            }

            const wBodmas = lvl < 15 ? 0 : clamp(((lvl - 15) / (MAX_LEVEL - 15)) * 0.30, 0, 0.30);
            const wMulDiv = clamp(0.15 + t * 0.40, 0.15, 0.55);
            const wMul = wMulDiv * 0.5;
            const wDiv = wMulDiv * 0.5;
            const wAdd = Math.max(0.08, (1 - wBodmas - wMulDiv) * 0.5);
            const wSub = Math.max(0.08, (1 - wBodmas - wMulDiv) * 0.5);

            const types = ["add", "subtract", "multiply", "divide", "bodmas"];
            const weights = [wAdd, wSub, wMul, wDiv, wBodmas];
            const total = weights.reduce(function (s, w) { return s + w; }, 0);
            let roll = Math.random() * total;
            for (let i = 0; i < types.length; i++) {
                roll -= weights[i];
                if (roll <= 0) return { type: types[i], simple: false };
            }
            return { type: "add", simple: false };
        }

        function isValid(q, limits) {
            if (!q || !Number.isFinite(q.answer) || q.answer < 0 || q.answer > limits.ansMax) return false;
            if (lvl < 100) {
                const nums = q.text.match(/\d+/g);
                if (nums) {
                    for (let i = 0; i < nums.length; i++) {
                        const n = parseInt(nums[i], 10);
                        if (n < 1 || n > 99) return false;
                    }
                }
            }
            return true;
        }

        function makeAdd(limits) {
            const pair = pickOperands(limits.opMax, limits.mixSizes);
            const a = pair[0];
            const b = pair[1];
            return { text: a + " + " + b, answer: a + b };
        }

        function makeSubtract(limits) {
            let pair = pickOperands(limits.opMax, limits.mixSizes);
            let a = pair[0];
            let b = pair[1];
            if (a < b) { const tmp = a; a = b; b = tmp; }
            if (a === b && a > 1) b -= 1;
            return { text: a + " − " + b, answer: a - b };
        }

        function makeMultiply(limits) {
            const cap = limits.mulCap;
            const a = randInt(2, cap);
            const b = randInt(2, cap);
            return { text: a + " × " + b, answer: a * b };
        }

        function makeDivide(limits) {
            const divisor = randInt(2, limits.divCap);
            const maxQuotient = clamp(Math.floor(limits.ansMax), 2, 99);
            const maxOpDiv = Math.floor(limits.opMax / divisor);
            const maxQVal = Math.max(2, Math.min(maxQuotient, maxOpDiv));
            const quotient = randInt(2, maxQVal);
            const dividend = divisor * quotient;
            if (lvl < 100 && dividend > 99) return null;
            return { text: dividend + " ÷ " + divisor, answer: quotient };
        }

        function makeBodmas(limits) {
            const variant = pick(["mul_add", "mul_sub", "add_mul"]);
            const xyMax = clamp(Math.min(limits.mulCap, 12), 2, limits.mulCap);

            if (variant === "mul_add") {
                const x = randInt(2, xyMax);
                const y = randInt(2, xyMax);
                const zHi = clamp(limits.opMax, 1, Math.max(1, limits.ansMax - x * y));
                const z = randInt(1, zHi);
                return { text: x + " × " + y + " + " + z, answer: x * y + z };
            }

            if (variant === "mul_sub") {
                const x = randInt(2, xyMax);
                const y = randInt(2, xyMax);
                const inner = x * y;
                if (inner < 2) return null;
                const z = randInt(1, inner - 1);
                return { text: x + " × " + y + " − " + z, answer: inner - z };
            }

            const b = randInt(2, xyMax);
            const c = randInt(2, xyMax);
            const product = b * c;
            const aMax = clamp(limits.opMax, 1, Math.max(1, limits.ansMax - product));
            const a = randInt(1, aMax);
            return { text: a + " + " + b + " × " + c, answer: a + product };
        }

        const chosen = pickOperation();
        const limits = getLimits(chosen.simple);

        for (let attempt = 0; attempt < 48; attempt++) {
            let q = null;
            switch (chosen.type) {
                case "add": q = makeAdd(limits); break;
                case "subtract": q = makeSubtract(limits); break;
                case "multiply": q = makeMultiply(limits); break;
                case "divide": q = makeDivide(limits); break;
                case "bodmas": q = makeBodmas(limits); break;
            }
            if (isValid(q, limits)) return q;
        }

        return { text: "4 + 3", answer: 7 };
    }

    function mapOptions(correct) {
        const pool = [correct];
        const spread = Math.max(8, Math.min(40, Math.floor(Math.abs(correct) * 0.15) + 10));
        while (pool.length < 4) {
            let wrong = correct + randInt(-spread, spread);
            if (wrong === correct || wrong < 0 || pool.includes(wrong)) {
                wrong = correct + pool.length * randInt(2, 6) + randInt(1, 5);
            }
            if (wrong !== correct && wrong >= 0 && !pool.includes(wrong)) pool.push(wrong);
        }
        const shuffled = pool.sort(function () { return Math.random() - 0.5; });
        optionButtons.forEach(function (btn, idx) {
            btn.textContent = String(shuffled[idx]);
            btn.classList.remove("state-correct", "state-wrong", "locked");
        });
    }

    function loadNextQuestion() {
        if (isPaused) return;
        inputLocked = false;
        const q = generateQuestion(currentLevel);
        rightAnswer = q.answer;
        equationEl.textContent = q.text;
        mapOptions(rightAnswer);
        startQuestionTimer();
        saveProgress();
        updatePauseButtonState();
    }

    function lockOptions() {
        inputLocked = true;
        optionButtons.forEach(function (btn) { btn.classList.add("locked"); });
        updatePauseButtonState();
    }

    function updateLevelFailedButtons() {
        const watchBtn = document.getElementById("level-failed-watch-btn");
        if (!watchBtn) return;
        watchBtn.hidden = false;
        watchBtn.disabled = false;
    }

    function resumeAfterRewardedAd() {
        closeModal(levelFailedModal);
        lifelines = 1;
        updateHeartsUI();
        inputLocked = false;
        optionButtons.forEach(function (btn) {
            btn.classList.remove("state-correct", "state-wrong", "locked");
        });
        isPaused = false;
        timerRing.classList.remove("frozen");

        loadNextQuestion();

        saveProgress();
        updatePauseButtonState();
    }

    function handleTimeOut() {
        if (inputLocked || isPaused || isBlockingModalOpen()) return;
        lockOptions();
        playSound("wrong");
        flashRed();
        lifelines -= 1;
        updateHeartsUI();
        saveProgress();
        lastFailReason = "time";
        setTimeout(function () {
            optionButtons.forEach(function (btn) {
                btn.classList.remove("state-correct", "state-wrong", "locked");
            });
            if (lifelines <= 0) {
                onLevelFailed("time");
            } else {
                inputLocked = false;
                loadNextQuestion();
            }
        }, 220);
    }

    function restartCurrentLevel() {
        closeModal(levelFailedModal);
        correctInLevel = 0;
        beginLevel(currentLevel, false);
    }

    function onLevelFailed(reason) {
        if (levelFailedModal.classList.contains("active")) return;
        isPaused = false;
        closeModal(pauseModal);
        lockOptions();
        stopTimer();
        lastFailReason = reason;
        levelFailedDesc.textContent = "You ran out of lifelines on Level " + currentLevel + ". Watch an ad for one lifeline, or restart from Question 1.";
        updateLevelFailedButtons();
        openModal(levelFailedModal);
        saveProgress();
        updatePauseButtonState();
    }

    function onLevelComplete() {
        isPaused = false;
        closeModal(pauseModal);
        stopTimer();
        lockOptions();
        playSound("complete");
        if (currentLevel >= MAX_LEVEL) {
            highestLevelReached = MAX_LEVEL;
            saveProgress();
            openModal(maxLevelModal);
            updatePauseButtonState();
            return;
        }
        highestLevelReached = Math.max(highestLevelReached, currentLevel + 1);
        levelCompleteDesc.textContent = "Perfect run! Level " + currentLevel + " cleared. Level " + (currentLevel + 1) + " is now unlocked.";
        openModal(levelCompleteModal);
        saveProgress();
        updatePauseButtonState();
    }

    function handleCorrect(btn) {
        lockOptions();
        stopTimer();
        playSound("correct");
        btn.classList.add("state-correct");
        const rect = btn.getBoundingClientRect();
        burstFx(rect.left + rect.width / 2, rect.top + rect.height / 2);
        sessionScore += 10 + currentLevel;
        correctInLevel += 1;
        updateHud();
        saveProgress();
        setTimeout(function () {
            btn.classList.remove("state-correct");
            if (correctInLevel >= QUESTIONS_PER_LEVEL) onLevelComplete();
            else loadNextQuestion();
        }, 280);
    }

    // Handles an incorrect answer response
    function handleWrong(btn) {
        lockOptions();
        playSound("wrong");
        btn.classList.add("state-wrong");
        flashRed();
        lifelines -= 1;
        updateHeartsUI();
        saveProgress();
        lastFailReason = "lifelines";
        setTimeout(function () {
            btn.classList.remove("state-wrong");
            if (lifelines <= 0) onLevelFailed("lifelines");
            else {
                inputLocked = false;
                loadNextQuestion();
            }
        }, 220);
    }

    function handleAnswer(btn) {
        if (isPaused || inputLocked || isBlockingModalOpen()) return;
        initAudio();
        const chosen = parseInt(btn.textContent, 10);
        if (chosen === rightAnswer) handleCorrect(btn);
        else handleWrong(btn);
    }

    function beginLevel(level, resetProgress) {
        closeAllModals();
        isPaused = false;
        currentLevel = clamp(level, 1, MAX_LEVEL);
        if (resetProgress) { correctInLevel = 0; sessionScore = 0; }
        lifelines = LIFELINES_PER_LEVEL;
        updateHeartsUI();
        updateHud();
        showScreen("game-screen");
        loadNextQuestion();
        updatePauseButtonState();
        try {
            history.pushState({ page: "game" }, "");
        } catch(e) {}
    }

    function buildMainMenu() {
        isPaused = false;
        stopTimer();
        const data = loadStorage();
        highestLevelReached = data && data.highestLevelReached ? Math.max(1, data.highestLevelReached) : 1;
        menuHighest.textContent = String(highestLevelReached);
        menuButtons.innerHTML = "";

        const savedLevel = data && data.level ? clamp(data.level, 1, MAX_LEVEL) : 1;
        const hasResume = savedLevel > 1 || (savedLevel === 1 && data && data.correctInLevel > 0);

        if (hasResume) {
            menuSubtitle.textContent = "Welcome back! Continue your journey or begin a fresh run from Level 1.";
            const resumeBtn = document.createElement("button");
            resumeBtn.type = "button";
            resumeBtn.className = "btn-action";
            resumeBtn.textContent = "Resume Game (Level " + savedLevel + ")";
            resumeBtn.addEventListener("click", function () {
                initAudio();
                currentLevel = savedLevel;
                correctInLevel = data.correctInLevel || 0;
                sessionScore = data.sessionScore || 0;
                lifelines = typeof data.lifelines === "number" ? clamp(data.lifelines, 0, LIFELINES_PER_LEVEL) : LIFELINES_PER_LEVEL;
                if (lifelines <= 0) lifelines = LIFELINES_PER_LEVEL;
                beginLevel(currentLevel, false);
            });
            menuButtons.appendChild(resumeBtn);

            const newBtn = document.createElement("button");
            newBtn.type = "button";
            newBtn.className = "btn-action secondary";
            newBtn.textContent = "Start New Game";
            newBtn.addEventListener("click", function () {
                initAudio();
                clearSavedProgress();
                beginLevel(1, true);
            });
            menuButtons.appendChild(newBtn);
        } else {
            menuSubtitle.textContent = "Train your brain across 1,000 levels. Fifteen correct answers per level. Two lifelines. Fifteen seconds per question.";
            const playBtn = document.createElement("button");
            playBtn.type = "button";
            playBtn.className = "btn-action";
            playBtn.textContent = "Play";
            playBtn.addEventListener("click", function () {
                initAudio();
                beginLevel(1, true);
            });
            menuButtons.appendChild(playBtn);
        }

        showScreen("menu-screen");
        updatePauseButtonState();
    }

    // Rewarded Ad Simulator Fallback Integration
    let adSuccessCallback = null;
    let adFailureCallback = null;

    window.SpeedMathsAdMob = window.SpeedMathsAdMob || {
        showRewardedAd: function (onSuccess, onFailure) {
            adSuccessCallback = onSuccess;
            adFailureCallback = onFailure;
            triggerAdSimulator();
        }
    };

    function triggerAdSimulator() {
        isPaused = true;
        stopTimer();

        const adModal = document.getElementById("ad-simulator-modal");
        const adProgress = document.getElementById("ad-progress-bar");
        const adSkip = document.getElementById("ad-skip-btn");

        adModal.classList.add("active");
        adProgress.style.width = "0%";
        adSkip.textContent = "Skip Ad in 3s";
        adSkip.disabled = true;

        // Force reflow
        void adProgress.offsetWidth;

        adProgress.style.width = "100%";

        let secondsLeft = 3;
        const countdownInterval = setInterval(function () {
            secondsLeft -= 1;
            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
                adSkip.textContent = "Claim Reward & Close";
                adSkip.disabled = false;
            } else {
                adSkip.textContent = "Skip Ad in " + secondsLeft + "s";
            }
        }, 1000);

        const handleClaim = function () {
            adSkip.removeEventListener("click", handleClaim);
            adModal.classList.remove("active");
            if (adSuccessCallback) {
                const cb = adSuccessCallback;
                adSuccessCallback = null;
                adFailureCallback = null;
                cb();
            }
        };

        adSkip.addEventListener("click", handleClaim);
    }

    // Initialize DOM interactions
    optionButtons.forEach(function (btn) {
        btn.addEventListener("click", function () { handleAnswer(btn); });
    });

    pauseBtn.addEventListener("click", function() {
        initAudio();
        pauseGame();
    });

    soundBtn.addEventListener("click", toggleSound);

    document.getElementById("pause-resume-btn").addEventListener("click", function() {
        initAudio();
        resumeGame();
    });

    document.getElementById("pause-menu-btn").addEventListener("click", function() {
        initAudio();
        exitToMainMenu();
    });

    document.getElementById("level-complete-btn").addEventListener("click", function () {
        initAudio();
        closeModal(levelCompleteModal);
        currentLevel += 1;
        correctInLevel = 0;
        lifelines = LIFELINES_PER_LEVEL;
        beginLevel(currentLevel, true);
    });

    document.getElementById("level-failed-watch-btn").addEventListener("click", function () {
        initAudio();
        const watchBtn = document.getElementById("level-failed-watch-btn");
        watchBtn.disabled = true;
        window.SpeedMathsAdMob.showRewardedAd(
            function () {
                resumeAfterRewardedAd();
            },
            function () {
                updateLevelFailedButtons();
            }
        );
    });

    document.getElementById("level-failed-restart-btn").addEventListener("click", function () {
        initAudio();
        restartCurrentLevel();
    });

    document.getElementById("max-level-btn").addEventListener("click", function () {
        initAudio();
        closeModal(maxLevelModal);
        clearSavedProgress();
        buildMainMenu();
    });

    // Audio init gesture hook
    document.body.addEventListener("click", function() {
        initAudio();
    }, { once: false });

    // Handle Page Visibility changes (app backgrounding / screen lock)
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            pauseGame();
            if (audioCtx && audioCtx.state === "running") {
                audioCtx.suspend();
            }
        } else {
            if (audioCtx && audioCtx.state === "suspended") {
                audioCtx.resume();
            }
        }
    });

    // Navigation and Hardware Back Button interceptor
    const exitConfirmModal = document.getElementById("exit-confirm-modal");

    // Push multiple buffer states so back button never runs out
    function pushBufferStates(n) {
        try {
            for (var i = 0; i < n; i++) {
                history.pushState({ page: "buffer" }, "");
            }
        } catch(e) {}
    }

    function showExitConfirmationModal() {
        openModal(exitConfirmModal);
        pushBufferStates(3); // replenish buffer inside modal too
    }

    document.getElementById("exit-no-btn").addEventListener("click", function() {
        closeModal(exitConfirmModal);
        pushBufferStates(5); // replenish buffer after cancel
    });

    document.getElementById("exit-yes-btn").addEventListener("click", function() {
        closeModal(exitConfirmModal);
        try {
            // Go back far enough to exhaust all our buffer states
            // and let the native WebView close the app
            history.go(-20);
        } catch(e) {}
    });

    window.addEventListener("popstate", function (event) {
        // Always replenish buffer immediately so rapid double-taps are caught
        pushBufferStates(3);

        if (exitConfirmModal.classList.contains("active")) {
            closeModal(exitConfirmModal);
            return;
        }

        if (gameScreen.classList.contains("active")) {
            // Inside gameplay: Back button = Pause / Resume
            if (isBlockingModalOpen()) {
                // close any open blocking modal (level complete, failed etc)
                closeAllModals();
                isPaused = false;
            } else if (!isPaused) {
                pauseGame();
            } else if (isPaused) {
                resumeGame();
            }
        } else {
            // In main menu: Back button = show Exit Confirmation
            showExitConfirmationModal();
        }
    });

    // Push 5 buffer states on startup to prevent immediate WebIntoApp ad
    pushBufferStates(5);

    // Startup configuration
    timerRing.style.strokeDasharray = String(TIMER_CIRCUMFERENCE);
    updateSoundButtonUI();
    buildMainMenu();
})();
