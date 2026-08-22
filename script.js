// ==========================================
// CONFIGURACIÓN SUPABASE (Tus credenciales exactas)
// ==========================================
const supabaseUrl = 'https://wgqqbahoalozgfukioza.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndncXFiYWhvYWxvemdmdWtpb3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNTA3OTYsImV4cCI6MjA5OTgyNjc5Nn0.v_kpYceS8ceIUBNaLLHjfyBeFA2Y3lDRy7Yn6cb5Uz8';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let usuarioAutenticado = null;
let balance = 0;

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

const RACE_TIME_MS = 12000;  
const FINISH_DELAY_MS = 5000; 
let estadoActual = 'CONNECTING'; 
let currentRoundData = null;
let raceStartTime = 0;
let historyLog = [];

// ==========================================
// INICIALIZACIÓN Y PERFIL
// ==========================================
window.onload = async function iniciarJuego() {
    document.getElementById("status-msg").innerText = "Verificando sesión de usuario...";
    
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error || !session || !session.user) {
            alert("Por favor inicia sesión en la plataforma principal.");
            window.location.href = "https://frankkoo10.github.io/casinou/";
            return;
        }

        usuarioAutenticado = session.user;
        await cargarSaldoDesdeBD();
        
        renderHistorial();
        prepararNuevaRonda();
    } catch(e) {
        console.error("Error al conectar con Supabase:", e);
        document.getElementById("status-msg").innerText = "Error de conexión con la cuenta.";
    }
};

async function cargarSaldoDesdeBD() {
    try {
        const { data, error } = await supabaseClient
            .from('perfiles')
            .select('saldo')
            .eq('id', usuarioAutenticado.id)
            .single();

        if (error || !data) {
            console.warn("No se encontró el perfil, usando saldo inicial de respaldo.");
            balance = 5000;
        } else {
            balance = data.saldo;
        }
    } catch(e) {
        console.error("Excepción al cargar saldo:", e);
        balance = 5000;
    }
    actualizarUIBalance();
}

async function guardarSaldoEnBD() {
    if (!usuarioAutenticado) return;
    try {
        await supabaseClient
            .from('perfiles')
            .update({ saldo: balance })
            .eq('id', usuarioAutenticado.id);
    } catch (e) {
        console.error("Error al actualizar saldo en la BD:", e);
    }
}

function actualizarUIBalance() {
    document.getElementById("balance-amount").innerText = balance.toFixed(2);
    renderBetBadges();
}

function toggleInfo() {
    const m = document.getElementById("info-modal");
    m.style.display = m.style.display === "flex" ? "none" : "flex";
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

// ==========================================
// GENERACIÓN DE CARRERA
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
// MOTOR Y ANIMACIÓN
// ==========================================
function iniciarCarreraManual() {
    if (estadoActual !== 'WAITING') return;
    
    let totalPreparado = currentBets.reduce((a,b)=>a+b,0);
    if (totalPreparado > 0) {
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

        let visualPos = Math.max(0, pos) * 82; 
        document.getElementById(`horse-${h.id}`).style.bottom = `${visualPos}%`;
    });
}

// ==========================================
// TRANSICIONES DE ESTADO
// ==========================================
function transitionToWaiting() {
    estadoActual = 'WAITING';
    document.getElementById("status-msg").innerText = "Haz tus apuestas y presiona Empezar Carrera.";
    document.getElementById("status-msg").style.color = "var(--muted)";
    
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
    document.getElementById("btn-apostar").disabled = true;
    document.getElementById("btn-clear").disabled = true;
    document.getElementById("btn-start").disabled = true;
}

async function transitionToFinished() {
    estadoActual = 'FINISHED';
    
    currentRoundData.horses.forEach(h => {
        let finalPos = (h.id === currentRoundData.winnerId) ? 82 : 72 + Math.random()*8;
        document.getElementById(`horse-${h.id}`).style.bottom = `${finalPos}%`;
    });

    let winner = currentRoundData.horses.find(h => h.id === currentRoundData.winnerId);
    let msg = document.getElementById("status-msg");
    
    let apostadoAlGanador = confirmedBets[winner.id];
    let apostadoTotal = confirmedBets.reduce((a,b)=>a+b,0);
    
    if (apostadoTotal > 0) {
        if (apostadoAlGanador > 0) {
            let ganancia = Math.floor(apostadoAlGanador * parseFloat(winner.payout));
            balance += ganancia;
            msg.style.color = "var(--success)";
            msg.innerText = `¡Ganó ${winner.name}! Cobras $${ganancia}.`;
        } else {
            msg.style.color = "var(--danger)";
            msg.innerText = `Ganó ${winner.name}. Perdiste $${apostadoTotal}.`;
        }
    } else {
        msg.style.color = "var(--accent)";
        msg.innerText = `El ganador es ${winner.name}. (Modo Espectador)`;
    }

    await guardarSaldoEnBD();
    actualizarUIBalance();
    
    historyLog.unshift(winner);
    if (historyLog.length > 10) historyLog.pop();
    renderHistorial();
    
    setTimeout(prepararNuevaRonda, FINISH_DELAY_MS);
}

// ==========================================
// INTERACCIÓN Y APUESTAS
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
    
    if (balance - totalPreparado < selectedChip) {
        alert("Créditos insuficientes."); return;
    }
    
    currentBets[horseId] += selectedChip;
    renderBetBadges();
}

function limpiarApuestas() {
    if (estadoActual !== 'WAITING') return;
    
    let totalConfirmado = confirmedBets.reduce((a,b)=>a+b,0);
    
    if (totalConfirmado > 0) {
        balance += totalConfirmado;
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
    
    balance -= totalNuevo;
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