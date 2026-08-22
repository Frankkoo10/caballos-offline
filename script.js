// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE Y USUARIO
// ==========================================
const SUPABASE_URL = 'TU_SUPABASE_URL'; // Reemplaza con tus datos reales
const SUPABASE_ANON_KEY = 'TU_SUPABASE_ANON_KEY';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let saldo = 0;

const horsesConfig = [
    { id: 0, name: "Relámpago", color: "#ff4d4d" },
    { id: 1, name: "Tormenta",  color: "#4da6ff" },
    { id: 2, name: "Viento",    color: "#2ecc71" },
    { id: 3, name: "Doradillo", color: "#ffd100" },
    { id: 4, name: "Sombra",    color: "#9d4edd" }
];

let currentBets = [0, 0, 0, 0, 0];
let confirmedBets = [0, 0, 0, 0, 0];
let selectedChip = 100;

// Motor de Carrera Local
const RACE_TIME_MS = 12000;  
const FINISH_DELAY_MS = 5000; 
let estadoActual = ''; 
let currentRoundData = null;
let raceStartTime = 0;
let historyLog = [];

// ==========================================
// 2. INICIALIZACIÓN Y AUTENTICACIÓN
// ==========================================
window.onload = async function iniciarJuego() {
    document.getElementById("status-msg").innerText = "Verificando sesión de usuario...";
    
    // Obtenemos el usuario autenticado en Supabase
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session) {
        alert("Por favor inicia sesión en la plataforma principal.");
        window.location.href = "https://frankkoo10.github.io/casinou/"; // Redirige al login principal si no hay sesión
        return;
    }

    currentUser = session.user;
    await cargarSaldoDesdeBD();
    
    renderHistorial();
    prepararNuevaRonda();
};

async function cargarSaldoDesdeBD() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('balance')
        .eq('id', currentUser.id)
        .single();

    if (error) {
        console.error("Error al cargar saldo:", error);
        saldo = 1000; // Valor por defecto de seguridad
    } else {
        saldo = data.balance;
    }
    actualizarUIBalance();
}

async function guardarSaldoEnBD() {
    const { error } = await supabaseClient
        .from('profiles')
        .update({ balance: saldo })
        .eq('id', currentUser.id);

    if (error) {
        console.error("Error al actualizar saldo en la BD:", error);
    }
}

function actualizarUIBalance() {
    document.getElementById("balance-amount").innerText = saldo.toFixed(2);
    renderBetBadges();
}

function renderHistorial() {
    const barra = document.getElementById("history-bar");
    barra.innerHTML = "";
    historyLog.forEach(winHorse => {
        const item = document.createElement("span");
        item.classList.add("history-item");
        item.style.backgroundColor = winHorse.color;
        item.innerText = `${winHorse.id + 1}`;
        barra.appendChild(item);
    });
}

function toggleInfo() {
    const m = document.getElementById("info-modal");
    m.style.display = m.style.display === "flex" ? "none" : "flex";
}

// ==========================================
// 3. GENERACIÓN DE CARRERA
// ==========================================
function prepararNuevaRonda() {
    currentBets = [0,0,0,0,0];
    confirmedBets = [0,0,0,0,0];

    let rawWeights = horsesConfig.map(() => Math.floor(Math.random() * 60) + 10);
    let totalWeight = rawWeights.reduce((a, b) => a + b, 0);
    
    let roundHorses = horsesConfig.map((h, i) => {
        let prob = rawWeights[i] / totalWeight;
        let payout = Math.max(1.10, (1 / prob) * 0.90);
        let animFactor = Math.random() * 2 - 1; 
        let loserTarget = 0.75 + Math.random() * 0.15;
        return { ...h, prob: prob, payout: payout.toFixed(2), animFactor, loserTarget };
    });

    let random = Math.random();
    let cumulative = 0;
    let winnerId = 0;
    for (let i = 0; i < roundHorses.length; i++) {
        cumulative += roundHorses[i].prob;
        if (random <= cumulative) { winnerId = roundHorses[i].id; break; }
    }

    currentRoundData = { horses: roundHorses, winnerId };

    renderTrack();
    renderOddsTable();
    transitionToWaiting();
}

// ==========================================
// 4. ANIMACIÓN Y MOTOR LOCAL
// ==========================================
function iniciarCarreraManual() {
    if (estadoActual !== 'WAITING') return;
    
    if (currentBets.reduce((a,b)=>a+b,0) > 0) {
        registrarApuesta();
    }
    
    raceStartTime = Date.now();
    transitionToRacing();
    requestAnimationFrame(loopCarreraLocal);
}

function loopCarreraLocal() {
    if (estadoActual !== 'RACING') return;
    let elapsed = Date.now() - raceStartTime;
    
    if (elapsed < RACE_TIME_MS) {
        let progress = elapsed / RACE_TIME_MS;
        animarCarrera(progress);
        requestAnimationFrame(loopCarreraLocal);
    } else {
        transitionToFinished();
    }
}

function animarCarrera(progress) {
    currentRoundData.horses.forEach(h => {
        let pos = 0;
        if (h.id === currentRoundData.winnerId) {
            pos = progress - Math.sin(progress * Math.PI) * 0.15;
        } else {
            let ruido = Math.sin(progress * Math.PI * 1.5) * 0.1 * h.animFactor;
            pos = (progress * h.loserTarget) + ruido;
        }

        if (typeof h.maxPos === 'undefined' || progress === 0) h.maxPos = 0;
        if (pos > h.maxPos) h.maxPos = pos;
        else pos = h.maxPos;

        let visualPos = Math.max(0, pos) * 85; 
        document.getElementById(`horse-${h.id}`).style.bottom = `${visualPos}%`;
    });
}

// ==========================================
// 5. TRANSICIONES
// ==========================================
function transitionToWaiting() {
    estadoActual = 'WAITING';
    document.getElementById("status-msg").innerText = "Haz tus apuestas y presiona Empezar Carrera.";
    document.getElementById("status-msg").style.color = "var(--muted)";
    document.getElementById("chips-container").classList.remove("disabled");
    
    let btnApostar = document.getElementById("btn-apostar");
    let btnClear = document.getElementById("btn-clear");
    let btnStart = document.getElementById("btn-start");
    
    btnStart.disabled = false;

    let totalConfirmado = confirmedBets.reduce((a,b)=>a+b,0);
    if (totalConfirmado > 0) {
        btnApostar.innerText = "Apuesta Confirmada";
        btnApostar.disabled = true;
        btnClear.innerText = "Cancelar";
        btnClear.disabled = false;
    } else {
        btnApostar.innerText = "Confirmar Apuestas";
        btnApostar.disabled = false;
        btnClear.innerText = "Limpiar";
        btnClear.disabled = false;
    }
    
    horsesConfig.forEach(h => {
        let el = document.getElementById(`horse-${h.id}`);
        if(el) { el.style.bottom = "2%"; delete h.maxPos; }
    });
}

function transitionToRacing() {
    estadoActual = 'RACING';
    document.getElementById("status-msg").innerText = "¡La carrera ha comenzado!";
    document.getElementById("chips-container").classList.add("disabled");
    
    document.getElementById("btn-apostar").disabled = true;
    document.getElementById("btn-clear").disabled = true;
    document.getElementById("btn-start").disabled = true;
}

async function transitionToFinished() {
    estadoActual = 'FINISHED';
    
    currentRoundData.horses.forEach(h => {
        let finalPos = (h.id === currentRoundData.winnerId) ? 85 : 75 + Math.random()*8;
        document.getElementById(`horse-${h.id}`).style.bottom = `${finalPos}%`;
    });

    let winner = currentRoundData.horses.find(h => h.id === currentRoundData.winnerId);
    let msg = document.getElementById("status-msg");
    
    let apostadoAlGanador = confirmedBets[winner.id];
    let apostadoTotal = confirmedBets.reduce((a,b)=>a+b,0);
    
    if (apostadoTotal > 0) {
        if (apostadoAlGanador > 0) {
            let ganancia = Math.floor(apostadoAlGanador * parseFloat(winner.payout));
            saldo += ganancia;
            msg.style.color = "var(--success)";
            msg.innerHTML = `<img src="trofeo.png" alt="Trofeo" class="emoji-img"> ¡Ganó ${winner.name}! Cobras $${ganancia}.`;
        } else {
            msg.style.color = "var(--danger)";
            msg.innerText = `Ganó ${winner.name}. Perdiste $${apostadoTotal}.`;
        }
    } else {
        msg.style.color = "var(--accent)";
        msg.innerHTML = `<img src="bandera_cuadros.png" alt="Meta" class="emoji-img"> El ganador es ${winner.name}. (Modo Espectador)`;
    }

    // Guardamos el saldo actualizado en la Base de Datos de Supabase de este usuario
    await guardarSaldoEnBD();
    actualizarUIBalance();
    
    historyLog.unshift(winner);
    if (historyLog.length > 15) historyLog.pop();
    renderHistorial();
    
    setTimeout(prepararNuevaRonda, FINISH_DELAY_MS);
}

// ==========================================
// 6. LÓGICA DE FICHAS Y APUESTAS
// ==========================================
function renderTrack() {
    const track = document.getElementById("track");
    track.innerHTML = '<div class="finish-line"></div>';
    
    currentRoundData.horses.forEach((h) => {
        track.innerHTML += `
            <div class="lane">
                <div class="horse-sprite" id="horse-${h.id}">
                    <img src="caballo.png" class="horse-img" alt="Caballo">
                    <span class="horse-number" style="background:${h.color};">${h.id + 1}</span>
                </div>
            </div>`;
    });
}

function renderOddsTable() {
    const tbody = document.getElementById("odds-body");
    tbody.innerHTML = "";
    
    currentRoundData.horses.forEach((h) => {
        let prob = Math.round(h.prob * 100);
        tbody.innerHTML += `
            <tr class="horse-row" onclick="addBet(${h.id})">
                <td style="text-align: left; font-weight:bold; color:#fff;">
                    <span class="color-box" style="background-color: ${h.color};"></span>
                    ${h.name}
                </td>
                <td>${prob}%</td>
                <td style="color: var(--accent); font-weight: bold;">${h.payout}x</td>
                <td><span class="bet-badge" id="badge-${h.id}">$0</span></td>
            </tr>`;
    });
    renderBetBadges();
}

function selectChip(val) {
    if (estadoActual !== 'WAITING') return;
    selectedChip = val;
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    document.getElementById(`chip-${val}`).classList.add("active");
}

function addBet(horseId) {
    if (estadoActual !== 'WAITING') return;
    let totalPreparado = currentBets.reduce((a,b)=>a+b,0) + confirmedBets.reduce((a,b)=>a+b,0);
    
    if (saldo - totalPreparado < selectedChip) {
        alert("Créditos insuficientes."); return;
    }
    
    currentBets[horseId] += selectedChip;
    renderBetBadges();
}

function limpiarApuestas() {
    if (estadoActual !== 'WAITING') return;
    
    let totalConfirmado = confirmedBets.reduce((a,b)=>a+b,0);
    
    if (totalConfirmado > 0) {
        saldo += totalConfirmado;
        confirmedBets = [0,0,0,0,0];
        currentBets = [0,0,0,0,0];
        guardarSaldoEnBD();
        
        let btnApostar = document.getElementById("btn-apostar");
        btnApostar.disabled = false;
        btnApostar.innerText = "Confirmar Apuestas";
        document.getElementById("btn-clear").innerText = "Limpiar";
    } else {
        currentBets = [0,0,0,0,0];
    }
    
    actualizarUIBalance();
}

function registrarApuesta() {
    let totalNuevo = currentBets.reduce((a,b)=>a+b,0);
    if (totalNuevo === 0) return;
    
    for(let i=0; i<5; i++) confirmedBets[i] += currentBets[i];
    currentBets = [0,0,0,0,0];
    
    saldo -= totalNuevo;
    actualizarUIBalance();
    guardarSaldoEnBD();
    
    let btnApostar = document.getElementById("btn-apostar");
    btnApostar.innerText = "Apuesta Confirmada";
    btnApostar.disabled = true; 
    
    document.getElementById("btn-clear").innerText = "Cancelar";
}

function renderBetBadges() {
    for(let i=0; i<5; i++) {
        const badge = document.getElementById(`badge-${i}`);
        if(!badge) continue;
        let total = currentBets[i] + confirmedBets[i];
        badge.innerText = total > 0 ? `$${total}` : "$0";
        if(total > 0) badge.classList.add("has-bet");
        else badge.classList.remove("has-bet");
    }
}