const page = document.body && document.body.dataset ? document.body.dataset.page : "";

// --- Binary-Safe IndexedDB Helper ---
const DB_NAME = "VerifexBinaryStore";
const STORE_NAME = "files";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeOriginalFile(file) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(file, "originalPayload");
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("IndexedDB store failed:", e);
  }
}

async function getOriginalFile() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get("originalPayload");
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("IndexedDB retrieve failed:", e);
    return null;
  }
}

function $(id) {
  return document.getElementById(id);
}

/**
 * 🔥 Optimization: Frontend Image Resizer
 * Resizes images to a maximum dimension (e.g., 1024px) before uploading.
 * This prevents 502 Bad Gateway timeouts on Render/Vercel caused by large payloads.
 */
async function resizeImage(file, maxDimension = 1024) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height *= maxDimension / width;
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width *= maxDimension / height;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          }));
        }, 'image/jpeg', 0.9);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function nowIso() {
  return new Date().toISOString();
}

let applyThemePreference = null;
let pendingProfileImageDataUrl = null;

function getStoredAuthUser() {
  try {
    const raw = localStorage.getItem("verifex.user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getUserDisplayName(user) {
  if (!user) return "User";
  return user.name || user.email || "User";
}

function getUserInitial(user) {
  const value = getUserDisplayName(user).trim();
  return value ? value[0].toUpperCase() : "U";
}

function setAvatarElement(el, user) {
  if (!el) return;
  if (user && user.profileImage) {
    el.style.backgroundImage = `url("${user.profileImage}")`;
    el.textContent = "";
  } else {
    el.style.backgroundImage = "none";
    el.textContent = getUserInitial(user);
  }
}

async function parseResponse(res) {
  const rawText = await res.text();
  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const serverMessage = data && typeof data.error === "string" ? data.error : "";
    const rawMessage = rawText.trim();

    if (res.status === 404) {
      throw new Error("Settings could not be saved. This API route is not available on the server yet. Restart the app server.");
    }

    if (serverMessage) {
      throw new Error(serverMessage);
    }

    if (rawMessage && rawMessage !== "Not Found") {
      throw new Error(rawMessage);
    }

    throw new Error("The server did not return a valid response. Please try again.");
  }

  if (!data) {
    throw new Error("The server response could not be parsed. Restart the app server and try again.");
  }

  return data;
}

function toSettingsError(message) {
  if (!message) return "Something went wrong. Please try again.";

  const normalized = String(message).trim();
  const mappings = [
    ["Backend is offline.", "The backend is currently offline."],
    ["Current password is incorrect.", "The current password is incorrect."],
    ["This email is already in use.", "This email address is already in use."],
    ["Account not found.", "The account could not be found."],
    ["Missing account reference.", "The account reference is missing."],
    ["Google/Clerk accounts should update email or password from the auth provider.", "Google or Clerk accounts must update email and password through the auth provider."],
    ["New password must be at least 8 characters.", "The new password must be at least 8 characters long."],
    ["The server did not return a valid response. Please try again.", "The server did not return a valid response. Please try again."],
    ["The server response could not be parsed. Restart the app server and try again.", "The server response could not be parsed. Restart the app server and try again."],
  ];

  for (const [source, target] of mappings) {
    if (normalized === source) return target;
  }

  return normalized;
}

function formatTs(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function triggerLoginRequired() {
  window.location.href = "login.html?reason=auth_required";
}

function clampHistory(items) {
  const max = 24;
  return items.slice(0, max);
}

function loadHistory() {
  try {
    const rawUser = localStorage.getItem("verifex.user");
    if (!rawUser) return [];
    const user = JSON.parse(rawUser);
    if (!user || !user.id) return [];

    const raw = localStorage.getItem(`verifex.history_${user.id}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  try {
    const rawUser = localStorage.getItem("verifex.user");
    if (!rawUser) return;
    const user = JSON.parse(rawUser);
    if (!user || !user.id) return;
    
    localStorage.setItem(`verifex.history_${user.id}`, JSON.stringify(clampHistory(items)));
  } catch(e) {
    console.error("Failed to save history", e);
  }
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const header = parts[0] || "";
  const body = parts[1] || "";
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = (mimeMatch && mimeMatch[1]) || "application/octet-stream";
  const bin = atob(body);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function fileToResizedDataUrl(file, maxDim, quality) {
  const bitmap = await createImageBitmap(file);
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, tw, th);
  return canvas.toDataURL("image/jpeg", quality);
}

// Scroll reveal observer
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
    }
  });
}, { threshold: 0.1 });

// Mobile Menu Toggle
function initMobileMenu() {
  const toggle = $("menuToggle");
  const navLinks = $("navLinks");
  if (!toggle || !navLinks) return;

  toggle.addEventListener("click", () => {
    const isActive = toggle.classList.toggle("active");
    navLinks.classList.toggle("active");
    document.body.style.overflow = isActive ? "hidden" : "";
    
    const nav = document.querySelector('.nav');
    if (isActive) {
      nav.classList.add('nav-scrolled');
    } else if (window.scrollY <= 30) {
      nav.classList.remove('nav-scrolled');
    }
  });

  navLinks.querySelectorAll(".nav-link, .nav-mobile-auth a").forEach(link => {
    link.addEventListener("click", () => {
      toggle.classList.remove("active");
      navLinks.classList.remove("active");
      document.body.style.overflow = "";
    });
  });
}

function initLanding() {
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
  
  window.addEventListener('scroll', () => {
    const nav = document.querySelector('.nav');
    if (window.scrollY > 30) {
      nav.classList.add('nav-scrolled');
    } else {
      nav.classList.remove('nav-scrolled');
    }
  });

  // Slider Logic
  const slider = $("imageSlider");
  if (slider) {
    const clip = $("sliderClip");
    const handle = $("sliderHandle");
    let isDragging = false;

    function moveSlider(e) {
      if (!isDragging) return;
      const rect = slider.getBoundingClientRect();
      // Handle both mouse and touch events
      const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
      let x = clientX - rect.left;
      x = Math.max(0, Math.min(x, rect.width));
      const percent = (x / rect.width) * 100;
      
      clip.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
      handle.style.left = `${percent}%`;
    }

    slider.addEventListener('mousedown', (e) => {
      isDragging = true;
      moveSlider(e);
    });
    
    slider.addEventListener('touchstart', (e) => {
      isDragging = true;
      moveSlider(e);
    }, { passive: true });

    window.addEventListener('mousemove', moveSlider);
    window.addEventListener('touchmove', moveSlider, { passive: true });

    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('touchend', () => { isDragging = false; });
  }

  const fileInput = $("file");
  const statusEl = $("landingStatus");
  const portal = $("portal");
  const dropzone = $("dropzone");
  const tryNowBtn = $("tryNowBtn");
  const isAuthenticated = () => !!localStorage.getItem("verifex.user");

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function scrollToUpload() {
    if (dropzone) dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function openPortalAndGo() {
    if (portal) portal.classList.add("open");
    // Show loader right away to feel responsive
    showLoader();
    setTimeout(() => {
      if (!isAuthenticated()) {
        window.location.href = "/login.html";
      } else {
        window.location.href = "/dashboard.html";
      }
    }, 150); // Reduced delay from 640ms to 150ms to prevent double-reload feel
  }

  async function handleFile(file) {
    if (!file) return;
    
    if (!isAuthenticated()) {
      triggerLoginRequired();
      return;
    }

    if (!/image\/(jpeg|png)/.test(file.type)) {
      setStatus("Unsupported file type. Use PNG or JPG.");
      return;
    }
    setStatus("Preparing scan...");
    
    // 🔥 Store the raw, original File object in IndexedDB to preserve metadata
    await storeOriginalFile(file);
    
    // We still generate thumbnails for the UI preview
    const mainDataUrl = await fileToResizedDataUrl(file, 1200, 0.86);
    const thumbDataUrl = await fileToResizedDataUrl(file, 220, 0.72);
    
    sessionStorage.setItem("verifex.current.image", mainDataUrl);
    sessionStorage.setItem("verifex.current.thumb", thumbDataUrl);
    sessionStorage.setItem("verifex.current.name", file.name || "image");
    sessionStorage.setItem("verifex.current.ts", nowIso());
    openPortalAndGo();
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    await handleFile(file);
  });

  // Intercept dropzone click for auth check
  dropzone.addEventListener("click", (e) => {
    if (!isAuthenticated()) {
      e.preventDefault();
      triggerLoginRequired();
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  dropzone.addEventListener("dragenter", (e) => {
    if (!isAuthenticated()) {
      e.preventDefault();
      return;
    }
    dropzone.classList.add("drag-active");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-active");
  });
  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-active");
    
    if (!isAuthenticated()) {
      triggerLoginRequired();
      return;
    }

    const file = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null;
    await handleFile(file);
  });

  if (tryNowBtn) {
    tryNowBtn.addEventListener("click", (e) => {
      if (!isAuthenticated()) {
        e.preventDefault();
        triggerLoginRequired();
      } else {
        scrollToUpload();
      }
    });
  }

  const terminalLog = $("terminalLog");
  if (terminalLog) {
    const messages = [
      "Analyzing environment noise...",
      "Entropy check: 0.842",
      "Network heartbeat: OK",
      "Waiting for forensic payload..."
    ];
    let i = 0;
    setInterval(() => {
      const line = document.createElement("div");
      line.textContent = `> ${messages[i % messages.length]}`;
      terminalLog.appendChild(line);
      if (terminalLog.childNodes.length > 8) {
        terminalLog.removeChild(terminalLog.firstChild);
      }
      i++;
    }, 3000);
  }

  document.querySelectorAll(".faq-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const answer = item ? item.querySelector(".faq-answer") : null;
      const isOpen = item.classList.contains("active");

      document.querySelectorAll(".faq-item").forEach((other) => {
        if (other !== item) {
          other.classList.remove("active");
          const otherAns = other.querySelector(".faq-answer");
          if (otherAns) otherAns.style.maxHeight = null;
        }
      });

      if (!isOpen) {
        item.classList.add("active");
        if (answer) answer.style.maxHeight = answer.scrollHeight + "px";
      } else {
        item.classList.remove("active");
        if (answer) answer.style.maxHeight = null;
      }
    });
  });
}

function renderHistory(items, onPick) {
  const list = $("historyList");
  const countEl = $("historyCount");
  const toggleCountEl = $("historyToggleCount");
  if (!list) return;
  list.innerHTML = "";

  if (countEl) countEl.textContent = `${items.length} Scans`;
  if (toggleCountEl) toggleCountEl.textContent = String(items.length);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.style.padding = "40px 20px";
    empty.style.textAlign = "center";
    empty.style.color = "var(--text-secondary)";
    empty.style.fontSize = "0.8rem";
    empty.textContent = "No analysis history.";
    list.appendChild(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "dashboard-history-item";
    row.dataset.id = item.id;

    const file = document.createElement("div");
    file.className = "dashboard-history-file";
    file.textContent = item.name || "analysis_payload";
    
    if (item.scan_id) {
      const scanIdEl = document.createElement("div");
      scanIdEl.style.fontSize = "0.7rem";
      scanIdEl.style.color = "var(--text-secondary)";
      scanIdEl.textContent = `ID: ${item.scan_id}`;
      file.appendChild(scanIdEl);
    }

    const sub = document.createElement("div");
    sub.className = "dashboard-history-sub";

    const statusDot = document.createElement("span");
    statusDot.className = "status-dot";
    const color = item.prediction === "Fake" ? "#f43f5e" : "#10b981";
    statusDot.style.background = color;
    statusDot.style.boxShadow = `0 0 10px ${color}`;

    const metaText = document.createElement("span");
    metaText.textContent = `${(item.confidence * 100).toFixed(0)}% • ${item.prediction === "Fake" ? "SYNTHETIC" : "AUTHENTIC"}`;

    sub.appendChild(statusDot);
    sub.appendChild(metaText);

    row.appendChild(file);
    row.appendChild(sub);
    row.addEventListener("click", () => {
      document.querySelectorAll(".dashboard-history-item").forEach(el => el.classList.remove("active"));
      row.classList.add("active");
      onPick(item.id);
    });

    list.appendChild(row);
  }
}

// 🔥 FIXED: Better indicator logic with validation
// --- D3.js Forensic Visualization Suite ---
function updateForensicVisuals(state) {
  const duration = 1200;
  const ease = d3.easeExpOut;
  
  // Safety: If state is missing, draw zero-state
  const isZeroState = !state || !state.prediction;
  const prediction = String(state?.prediction || "").toLowerCase().trim();
  const isFake = prediction === "fake";
  
  // Define dynamic colors for light theme contrast
  const authenticColor = "#1a73e8"; // Deep Google Blue
  const syntheticColor = "#d93025"; // Sharp Crimson Red
  const activeColor = isZeroState ? "#9ca3af" : (isFake ? syntheticColor : authenticColor);
  const trackColor = "#e5e7eb"; // Clearly visible grey for track

  // --- 1. Use Deterministic Visualization Data from Backend ---
  // Priority: forensic_profiles (new) > visual_data (old)
  const forensicProfiles = state?.forensic_profiles || {};
  const visualData = state?.visual_data || {};
  const profiles = visualData.profiles || {};
  const vars = visualData.variances || {};
  
  const graphProfiles = {
    'frequency': forensicProfiles['frequency']?.type || profiles['frequency'] || (isZeroState ? 'ZERO' : (isFake ? 'FAKE' : 'REAL')),
    'edge': forensicProfiles['edge']?.type || profiles['edge'] || (isZeroState ? 'ZERO' : (isFake ? 'FAKE' : 'REAL')),
    'noise': forensicProfiles['noise']?.type || profiles['noise'] || (isZeroState ? 'ZERO' : (isFake ? 'FAKE' : 'REAL'))
  };

  // Helper to get seed-based variance
  const getSeed = (key) => forensicProfiles[key]?.seed || 0.5;

  // Subtle shadow for depth on light background
  const subtleShadow = "drop-shadow(0px 2px 3px rgba(0,0,0,0.1))";
  
  // Helper to remove shimmer
  const removeShimmer = (id) => d3.select(id).classed("loading-shimmer", false);

  // Helper to create gradient
  const createGradient = (svg, id, color) => {
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
      .attr("id", id)
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "0%").attr("y2", "100%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.4);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0);
    return `url(#${id})`;
  };

  // 1. Neural Confidence Gauge
  (function renderModelGauge() {
    const containerId = "#model-gauge-v2";
    const container = d3.select(containerId);
    if (container.empty()) return;
    container.selectAll("*").remove();
    removeShimmer(containerId);
    
    const width = container.node().clientWidth || 280;
    const height = 180;
    const radius = Math.min(width, height * 1.5) / 2 - 20;
    
    const svg = container.append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${width/2},${height - 30})`);

    const arcGenerator = d3.arc()
      .innerRadius(radius - 15)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2);

    // Track arc
    svg.append("path")
      .attr("d", arcGenerator)
      .attr("fill", trackColor)
      .attr("stroke", "none");

    // Add labels: REAL and FAKE
    const labelY = 15;
    const labelPadding = 10;
    
    svg.append("text")
      .attr("x", -radius - labelPadding)
      .attr("y", labelY)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .style("font-family", "inherit")
      .style("font-size", "0.7rem")
      .style("font-weight", "600")
      .text("REAL");

    svg.append("text")
      .attr("x", radius + labelPadding)
      .attr("y", labelY)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .style("font-family", "inherit")
      .style("font-size", "0.7rem")
      .style("font-weight", "600")
      .text("FAKE");

    // Value mapping
    const confidence = state?.confidence || 0.5;
    const score = isZeroState ? 0.5 : confidence;
    const angleValue = isFake ? (score * 180 - 90) : ((1-score) * 180 - 90);

    const needle = svg.append("g")
      .attr("transform", "rotate(-90)");

    needle.append("line")
      .attr("x1", 0).attr("y1", 0)
      .attr("x2", 0).attr("y2", -radius + 10)
      .attr("stroke", activeColor)
      .attr("stroke-width", 3.5)
      .attr("stroke-linecap", "round")
      .style("filter", subtleShadow);

    needle.append("circle")
      .attr("r", 7)
      .attr("fill", "#fff")
      .attr("stroke", activeColor)
      .attr("stroke-width", 2);

    if (!isZeroState) {
      needle.transition()
        .duration(duration)
        .ease(ease)
        .attr("transform", `rotate(${angleValue})`);
    }
  })();

  // 2. Frequency Spectrum Waveform
  (function renderFreqSpectrum() {
    const containerId = "#freq-spectrum";
    const container = d3.select(containerId);
    if (container.empty()) return;
    container.selectAll("*").remove();
    removeShimmer(containerId);

    const width = container.node().clientWidth || 280;
    const height = 160;
    const margin = {top: 20, right: 10, bottom: 20, left: 10};
    
    const svg = container.append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

    const profile = graphProfiles['frequency'];
    const chartColor = profile === 'ZERO' ? "#9ca3af" : (profile === 'FAKE' ? syntheticColor : authenticColor);
    const gradId = `freq-grad-${Math.random().toString(36).substr(2, 9)}`;
    const fillGrad = createGradient(svg, gradId, chartColor);
    
    const data = [];
    const points = 60;
    
    // Use deterministic multipliers from backend seeds or fallbacks
    const seed = getSeed('frequency');
    const steepness = vars.freq_steepness || (2 + seed * 4); 
    const amplitude = vars.freq_amplitude || (0.3 + seed * 0.4);
    const spikeFreq = vars.freq_spike_freq || (20 + seed * 30);

    for (let i = 0; i <= points; i++) {
      const x = i / points;
      let y;
      if (profile === 'ZERO') {
        y = 0.1;
      } else if (profile === 'REAL') {
        // REAL Profile: Smooth, gently decaying curve. Randomize steepness.
        y = Math.exp(-x * steepness) * (0.7 + Math.random() * 0.05) + 0.1;
      } else {
        // FAKE Profile: Jagged, erratic spikes. Randomize amplitude and frequency.
        y = (1 - x) * amplitude + (Math.sin(x * spikeFreq) * 0.15) + (Math.random() * 0.1) + 0.1;
      }
      data.push({x, y: Math.max(0, y)});
    }

    const xScale = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);
    const yScale = d3.scaleLinear().domain([0, 1.2]).range([height - margin.bottom, margin.top]);

    const area = d3.area()
      .x(d => xScale(d.x))
      .y0(height - margin.bottom)
      .y1(height - margin.bottom)
      .curve(profile === 'FAKE' ? d3.curveStep : d3.curveBasis);

    svg.append("path")
      .datum(data)
      .attr("fill", fillGrad)
      .attr("d", area)
      .transition()
      .duration(duration)
      .ease(ease)
      .attr("d", area.y1(d => yScale(d.y)));

    const line = d3.line()
      .x(d => xScale(d.x))
      .y(height - margin.bottom)
      .curve(profile === 'FAKE' ? d3.curveStep : d3.curveBasis);

    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", chartColor)
      .attr("stroke-width", 2.5)
      .attr("d", line)
      .transition()
      .duration(duration)
      .ease(ease)
      .attr("d", line.y(d => yScale(d.y)));
  })();

  // 3. Edge Radial Smoothness
  (function renderEdgeRadial() {
    const containerId = "#edge-radial";
    const container = d3.select(containerId);
    if (container.empty()) return;
    container.selectAll("*").remove();
    removeShimmer(containerId);

    const width = container.node().clientWidth || 280;
    const height = 160;
    const radius = Math.min(width, height) / 2 - 20;
    
    const svg = container.append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${width/2},${height/2})`);

    const profile = graphProfiles['edge'];
    const chartColor = profile === 'ZERO' ? "#9ca3af" : (profile === 'FAKE' ? syntheticColor : authenticColor);
    
    const data = [];
    const points = 50;
    const seed = getSeed('edge');
    const jitterSeverity = vars.edge_jitter || (0.05 + seed * 0.2); 

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      let r;
      if (profile === 'ZERO') {
        r = 0.5;
      } else if (profile === 'REAL') {
        // REAL Profile: Smooth, near-perfect circle.
        r = 0.8 + (Math.sin(angle * 8) * 0.005); 
      } else {
        // FAKE Profile: Introduce jitter using deterministic seeds.
        const noise = (Math.sin(angle * 50 + seed * 10) * 0.5) * jitterSeverity;
        const warp = Math.sin(angle * (4 + seed * 8)) * 0.1;
        r = 0.6 + noise + warp;
      }
      data.push({angle, r});
    }
    data.push(data[0]);

    const radialLine = d3.lineRadial()
      .angle(d => d.angle)
      .radius(0)
      .curve(profile === 'REAL' ? d3.curveCardinalClosed : d3.curveLinearClosed);

    svg.append("path")
      .datum(data)
      .attr("fill", chartColor)
      .attr("opacity", 0.05)
      .attr("d", radialLine)
      .transition()
      .duration(duration)
      .ease(ease)
      .attr("d", radialLine.radius(d => d.r * radius));

    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", chartColor)
      .attr("stroke-width", 2.5)
      .attr("d", radialLine.radius(0))
      .transition()
      .duration(duration)
      .ease(ease)
      .attr("d", radialLine.radius(d => d.r * radius));
  })();

  // 4. Noise Distribution Gaussian (Bell Curve)
  (function renderNoiseGaussian() {
    const containerId = "#noise-distribution";
    const container = d3.select(containerId);
    if (container.empty()) return;
    container.selectAll("*").remove();
    removeShimmer(containerId);

    const width = container.node().clientWidth || 280;
    const height = 160;
    const margin = {top: 20, right: 10, bottom: 20, left: 10};
    
    const svg = container.append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

    const profile = graphProfiles['noise'];
    const chartColor = profile === 'ZERO' ? "#9ca3af" : (profile === 'FAKE' ? syntheticColor : authenticColor);
    const gradId = `noise-grad-${Math.random().toString(36).substr(2, 9)}`;
    const fillGrad = createGradient(svg, gradId, chartColor);
    
    const gaussianFunc = (x, mean, sigma) => {
      const exponent = -0.5 * Math.pow((x - mean) / sigma, 2);
      return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
    };

    const data = [];
    const points = 100;
    const mean = 0.5;
    
    // Deterministic parameters from backend seeds or fallbacks
    const seed = getSeed('noise');
    const realSigma = vars.noise_sigma_real || (0.05 + seed * 0.05);
    const fakeSigma = vars.noise_sigma_fake || (0.15 + seed * 0.35);
    const peakRandom = vars.noise_peak || (0.8 + seed * 0.4);
    const asymmetry = vars.noise_asymmetry || ((seed - 0.5) * 0.1);

    for (let i = 0; i <= points; i++) {
      const xVal = i / points;
      let yVal;
      
      if (profile === 'ZERO') {
        yVal = gaussianFunc(xVal, mean, 0.25);
      } else if (profile === 'REAL') {
        // REAL Profile: Tight, high-peaking Gaussian curve.
        yVal = gaussianFunc(xVal, mean, realSigma) * peakRandom;
      } else {
        // FAKE Profile: Flattened, wide, or slightly asymmetrical.
        yVal = gaussianFunc(xVal, mean + asymmetry, fakeSigma);
        // Add deterministic lumpy variance
        yVal += (Math.sin(xVal * 25 + seed * 5) * 0.05);
      }
      data.push({x: xVal, y: Math.max(0, yVal)});
    }

    const xScale = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);
    const yMax = d3.max(data, d => d.y);
    const yScale = d3.scaleLinear().domain([0, yMax]).range([height - margin.bottom, margin.top]);

    const area = d3.area()
      .x(d => xScale(d.x))
      .y0(height - margin.bottom)
      .y1(height - margin.bottom)
      .curve(d3.curveBasis);

    svg.append("path")
      .datum(data)
      .attr("fill", fillGrad)
      .attr("d", area)
      .transition()
      .duration(duration)
      .ease(ease)
      .attr("d", area.y1(d => yScale(d.y)));

    const line = d3.line()
      .x(d => xScale(d.x))
      .y(height - margin.bottom)
      .curve(d3.curveBasis);

    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", chartColor)
      .attr("stroke-width", 2.5)
      .attr("d", line)
      .transition()
      .duration(duration)
      .ease(ease)
      .attr("d", line.y(d => yScale(d.y)));
  })();
}

function setIndicator(state) {
  const bar = $("indicatorBar");
  const label = $("resultLabel");
  const conf = $("confidenceChip");
  const model = $("modelChip");
  const status = $("statusChip");
  const analysis = $("analysisText");
  const explanationError = $("explanationError");
  const explanationErrorMessage = $("explanationErrorMessage");
  const explanationMethodsGrid = $("explanationMethodsGrid");
  
  if (!bar || !label || !conf || !model || !status) return;

  // Handle Error State
  if (state.labelText === "ERROR") {
    label.textContent = "SCAN FAILED";
    bar.style.width = "100%";
    bar.style.background = "#f43f5e";
    label.style.color = "#f43f5e";
    status.textContent = "FAILED";
    status.style.background = "rgba(244, 63, 94, 0.1)";
    status.style.color = "#f43f5e";
    conf.textContent = "Error during analysis";
    
    if (explanationError && explanationErrorMessage && explanationMethodsGrid) {
      explanationError.style.display = "block";
      explanationMethodsGrid.style.display = "none";
      explanationErrorMessage.textContent = state.explanation || "Unknown forensic error occurred.";
    }
    return;
  }

  // Reset UI from potential error state
  if (explanationError && explanationMethodsGrid) {
    explanationError.style.display = "none";
    explanationMethodsGrid.style.display = "grid";
  }
  status.style.background = ""; // Reset status style
  status.style.color = "";

  if (state.statusText) status.textContent = state.statusText;
  
  // 🔥 Trigger D3 Forensic Visuals
  updateForensicVisuals(state);
  
  // 🔥 FIX: Handle NaN and undefined confidence
  let confidenceValue = 0;
  if (typeof state.confidence === "number" && !isNaN(state.confidence)) {
    confidenceValue = Math.max(0, Math.min(1, state.confidence)); // Clamp 0-1
  }
  
  conf.textContent = `Confidence: ${(confidenceValue * 100).toFixed(1)}%`;
  
  if (typeof state.modelLoaded === "boolean") {
    model.textContent = `Engine: ${state.modelLoaded ? "Xception (Local)" : "Inference Mock"}`;
  }
  
  if (analysis) {
    analysis.textContent = "";
  }

  // Update progress bar
  bar.style.width = `${confidenceValue * 100}%`;
  
  // 🔥 FIX: Case-insensitive prediction check
  const prediction = String(state.prediction || "").toLowerCase().trim();
  
  if (prediction === "real") {
    label.textContent = "AUTHENTIC";
    bar.style.background = "#10b981"; // Emerald
    label.style.color = "#10b981";
    bar.classList.remove("pulse");
  } else if (prediction === "fake") {
    label.textContent = "SYNTHETIC";
    bar.style.background = "#f43f5e"; // Rose
    label.style.color = "#f43f5e";
    bar.classList.add("pulse"); // Add pulse for fake
  } else {
    label.textContent = state.labelText || "AWAITING PAYLOAD";
    bar.style.background = "var(--accent-color)";
    label.style.color = "var(--text-primary)";
    bar.classList.remove("pulse");
  }

  // --- Four separate grayscale visualizations using real backend data ---
  // Use debug_scores from backend for accurate visualization
  let freq = 0.5, edge = 0.5, modelScore = 0.5, noise = 0.5;
  
  // Extract real scores from backend debug_scores
  if (state.debug_scores && typeof state.debug_scores === "object") {
    freq = Math.max(0, Math.min(1, state.debug_scores.frequency_score || 0));
    edge = Math.max(0, Math.min(1, state.debug_scores.edge_score || 0));
    noise = Math.max(0, Math.min(1, state.debug_scores.noise_score || 0));
    // Model score is based on the overall ensemble score (check prediction to determine direction)
    const isPredictionFake = String(state.prediction || "").toLowerCase().trim() === "fake";
    if (isPredictionFake) {
      modelScore = state.ensemble_score || state.confidence || 0.5;
    } else {
      modelScore = 1 - (state.ensemble_score || state.confidence || 0.5);
    }
  }
  
  // Extract noise from explanation text as fallback/supplement (if debug_scores.noise_score is missing)
  if (state.explanation && typeof state.explanation === "string" && (!state.debug_scores || !state.debug_scores.noise_score)) {
    const noiseMatch = state.explanation.match(/High-frequency noise variance: ([0-9.]+)/i);
    if (noiseMatch) {
      let n = parseFloat(noiseMatch[1]);
      // Normalize noise variance to 0-1 range (legacy logic)
      // If the backend is sending normalized 0.0-1.0, we keep it. 
      // If it's sending raw variance (e.g. 200), we divide by 500 to normalize it for the visual bar.
      noise = n > 1.0 ? Math.max(0, Math.min(1, n / 500)) : n;
    }
  }
  
  // Render each method's card with Cyberpunk Forensic aesthetic
  function renderMethodCard(cardId, visualId, textId, value, title, description) {
    const card = $(cardId);
    const visual = $(visualId);
    const text = $(textId);
    
    if (visual && card) {
      visual.innerHTML = "";
      
      // Remove old glow classes
      card.classList.remove("real-glow", "fake-glow");
      
      // 0-0.3: High Risk, 0.3-0.7: Moderate Risk, 0.7-1.0: Low Risk (Authentic)
      let label = "LOW";
      let colorClass = "fake-fill";
      let glowClass = "fake-glow";
      
      if (value >= 0.8) {
        label = "AUTHENTIC";
        colorClass = "real-fill";
        glowClass = "real-glow";
      } else if (value >= 0.5) {
        label = "MODERATE";
        colorClass = "real-fill";
        glowClass = "real-glow";
      } else if (value >= 0.3) {
        label = "SUSPECT";
        colorClass = "fake-fill";
        glowClass = "fake-glow";
      } else {
        label = "HIGH RISK";
        colorClass = "fake-fill";
        glowClass = "fake-glow";
      }

      card.classList.add(glowClass);
      
      // Bar visualization
      const barWrapper = document.createElement("div");
      barWrapper.className = "forensic-bar-wrapper";
      
      const barFill = document.createElement("div");
      barFill.className = `forensic-bar-fill ${colorClass}`;
      // Animate from 0 to target width
      setTimeout(() => {
        barFill.style.width = `${Math.round(value * 100)}%`;
      }, 50);
      
      barWrapper.appendChild(barFill);
      
      // Add text label instead of percentage
      const forensicLabel = document.createElement("div");
      forensicLabel.className = "forensic-label";
      forensicLabel.style.color = label.includes("AUTHENTIC") || label.includes("MODERATE") ? "var(--success-color)" : "var(--danger-color)";
      forensicLabel.textContent = label;
      
      visual.appendChild(barWrapper);
      visual.appendChild(forensicLabel);
    }
    
    if (text) {
      text.innerHTML = `<strong style="color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em;">${title}</strong><br><span style="font-size: 0.8rem; opacity: 0.7; line-height: 1.4;">${description}</span>`;
    }
  }
  
  // Populate all four method cards with rich descriptions
  renderMethodCard("freqCard", "freqVisual", "freqText", freq, 
    "Frequency Analysis", 
    "Measures natural pattern consistency in image textures. Higher scores indicate more natural frequency signatures without AI compression artifacts.");
  
  renderMethodCard("edgeCard", "edgeVisual", "edgeText", edge, 
    "Edge Detection", 
    "Analyzes boundary consistency and edge sharpness. Detects unnatural transitions that are typical in AI-generated or heavily manipulated images.");
  
  renderMethodCard("modelCard", "modelVisual", "modelText", modelScore, 
    "Neural Confidence", 
    "Overall system confidence score based on Xception deep learning model. Represents the forensic engine's verdict reliability across all analysis layers.");
  
  renderMethodCard("noiseCard", "noiseVisual", "noiseText", noise, 
    "Noise Variance", 
    "Quantifies high-frequency noise patterns. Synthetic images typically show uniform noise while authentic photos have organic noise distribution.");
}
async function predictBinaryFile(fileOrBlob, filename) {
  // 🔥 Binary-Safe upload: We use the raw File/Blob object directly.
  // This ensures EXIF/C2PA metadata is perfectly preserved.
  const form = new FormData();
  form.append("file", fileOrBlob, filename || "image.jpg");
  
  try {
    const raw = localStorage.getItem("verifex.user");
    if (raw) {
      const user = JSON.parse(raw);
      if (user.id) {
        form.append("userId", user.id);
      }
    }
  } catch (e) {}

  const cacheBuster = `?t=${Date.now()}`;
  const res = await fetch(`/predict${cacheBuster}`, { 
    method: "POST", 
    body: form,
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  
  const data = await res.json();
  
  if (!data || typeof data !== 'object') {
    throw new Error("Invalid response from server");
  }
  
  if (data.error) {
    throw new Error(data.error);
  }
  
  return data;
}

// Kept for backward compatibility if needed by other logic, 
// but redirected to our new binary-safe function.
async function predictFromDataUrl(dataUrl, filename) {
  const blob = dataUrlToBlob(dataUrl);
  return predictBinaryFile(blob, filename);
}

function initDashboard() {
  // 🔥 Optimization: Ping backend health on load to wake up Render (cold start)
  fetch('/health').then(r => r.json()).then(d => console.log("[Backend] Awake:", d.version)).catch(() => {});

  if (!localStorage.getItem("verifex.user")) {
    window.location.href = "/login.html";
    return;
  }

  const currentImg = $("currentImg");
  const emptyState = $("emptyState");
  const analysisContent = $("analysisContent");
  const currentMeta = $("currentMeta");
  const newFile = $("newFile");
  const clearHistoryBtn = $("clearHistoryBtn");
  const dashboardShell = document.querySelector(".dashboard-shell");
  const historyToggleBtn = $("historyToggleBtn");
  const closeHistoryBtn = $("closeHistoryBtn");
  const HISTORY_COLLAPSED_KEY = "verifex.dashboard.historyCollapsed";

  let history = loadHistory();
  let selectedId = history.length ? history[0].id : null;
  let historyCollapsed = localStorage.getItem(HISTORY_COLLAPSED_KEY) === "true";

  function applyHistoryVisibility(collapsed) {
    historyCollapsed = !!collapsed;
    if (dashboardShell) {
      dashboardShell.classList.toggle("history-collapsed", historyCollapsed);
    }
    if (historyToggleBtn) {
      historyToggleBtn.setAttribute("aria-expanded", historyCollapsed ? "false" : "true");
      historyToggleBtn.dataset.collapsed = historyCollapsed ? "true" : "false";
    }
    localStorage.setItem(HISTORY_COLLAPSED_KEY, String(historyCollapsed));
  }

  function setCurrent(item) {
    if (!item) {
      if (emptyState) emptyState.style.display = "block";
      if (analysisContent) analysisContent.style.display = "none";
      // Hide Neural Explanation in empty state
      const neuralCard = $("neuralExplanationCard");
      if (neuralCard) {
        neuralCard.style.display = "none";
      }
      return;
    }
    selectedId = item.id;

    if (currentMeta) currentMeta.textContent = `${item.name || "analysis_payload"}`;
    // Show actual scan_id, fallback to id if not available
    if ($("scanId")) $("scanId").textContent = `${item.scan_id || item.id}`;
    if (currentImg) {
      const orig = currentImg;
      orig.style.display = "none";
      if (orig.previousElementSibling) {
        orig.previousElementSibling.style.display = "flex";
        orig.previousElementSibling.innerHTML = "<span>Loading...</span>";
      }
      
      // LOGIC: Show Heatmap for FAKE, show forensic crop for REAL
      const resultImage = item.prediction === "Fake" ? item.heatmap : item.image;
      orig.src = resultImage || ""; 
      orig.style.filter = "none";
    }
    if ($("originalImg")) {
      const orig = $("originalImg");
      orig.style.display = "none";
      if (orig.previousElementSibling) {
        orig.previousElementSibling.style.display = "flex";
        orig.previousElementSibling.innerHTML = "<span>Loading...</span>";
      }
      orig.src = item.originalImage || item.image || ""; // Use item.originalImage directly
    }
    if (emptyState) emptyState.style.display = "none";
    if (analysisContent) analysisContent.style.display = "block";

    // Trigger D3 Forensic Visuals update for the selected item
    updateForensicVisuals(item);

    setIndicator({
      prediction: item.prediction,
      confidence: item.confidence,
      modelLoaded: item.modelLoaded,
      explanation: item.explanation,
      statusText: "COMPLETED",
      debug_scores: item.debug_scores,
      ensemble_score: item.ensemble_score,
      forensic_profiles: item.forensic_profiles,
      visual_data: item.visual_data
    });
    
    // Show Neural Explanation after scan completes
    const neuralCard = $("neuralExplanationCard");
    if (neuralCard) {
      neuralCard.style.display = "flex";
    }
  }

  let isScanning = false;
  
  function pick(id) {
    if (isScanning) return; // Disable switching during scan
    const item = history.find((x) => x.id === id);
    if (item) setCurrent(item);
  }

  async function loadServerHistory() {
    try {
      const raw = localStorage.getItem("verifex.user");
      if (!raw) return;
      const user = JSON.parse(raw);
      if (!user.id) return;

      // Use relative path for production
      const res = await fetch(`/api/history?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const localHistory = loadHistory();
          history = data.map(item => {
            const localItem = localHistory.find(x => x.id === item.scanId || x.scan_id === item.scanId);
            
            let validImage = item.image;
            if (validImage && validImage === "REMOVED_FOR_BANDWIDTH") {
              // Try to find in local history if it was removed for bandwidth on server
              if (localItem && localItem.image) {
                validImage = localItem.image;
              } else {
                validImage = null; // Or a placeholder
              }
            }
            
            if (validImage && validImage.startsWith("data:multipart")) {
              // Fix old corrupted data URLs
              const base64Part = validImage.split("base64,")[1];
              if (base64Part) {
                  validImage = "data:image/jpeg;base64," + base64Part;
              }
            }
            
            // Fallback chain: originalImage > image > crop_image from details > validImage
            let imageForOriginal = item.originalImage || item.image || (item.details && item.details.crop_image ? `data:image/jpeg;base64,${item.details.crop_image}` : validImage);
            
            return {
              id: item.scanId, // Use scanId as the internal ID
              scan_id: item.scanId,
              ts: item.timestamp,
              name: localItem ? localItem.name : (item.details && item.details.filename ? item.details.filename : "Convex Upload"),
              image: item.image || validImage,
              originalImage: imageForOriginal,
              prediction: item.prediction,
              confidence: item.confidence,
              explanation: item.details?.explanation || "Analyzed securely.",
              heatmap: item.heatmap || item.details?.heatmap || null,
              debug_scores: item.details?.debug_scores || {},
              ensemble_score: item.details?.ensemble_score || item.confidence,
              forensic_profiles: item.details?.forensic_profiles || {},
              visual_data: item.details?.visual_data || {},
              modelLoaded: item.details?.model_loaded || item.details?.modelLoaded || true
            };
          });
          
          // Limit to 10
          history = history.slice(0, 10);
          
          saveHistory(history); // update local storage with the merged valid history
          if (!isScanning) renderHistory(history, pick);
          
          if (history.length && !isScanning) {
             const currentlySelected = history.find(x => x.id === selectedId);
             if (currentlySelected) pick(currentlySelected.id);
             else pick(history[0].id);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch history:", e);
    }
  }

  renderHistory(history, pick);
  applyHistoryVisibility(historyCollapsed);
  loadServerHistory();

  if (selectedId) pick(selectedId);
  else setIndicator({ labelText: "Stand by", statusText: "Status Idle" });

  historyToggleBtn?.addEventListener("click", () => {
    applyHistoryVisibility(false);
  });

  closeHistoryBtn?.addEventListener("click", () => {
    applyHistoryVisibility(true);
  });

  async function runScanFromSession() {
    const image = sessionStorage.getItem("verifex.current.image");
    const thumb = sessionStorage.getItem("verifex.current.thumb");
    const name = sessionStorage.getItem("verifex.current.name") || "image";
    const ts = sessionStorage.getItem("verifex.current.ts") || nowIso();
    
    if (!image || !thumb) return;

    sessionStorage.removeItem("verifex.current.image");
    sessionStorage.removeItem("verifex.current.thumb");
    sessionStorage.removeItem("verifex.current.name");
    sessionStorage.removeItem("verifex.current.ts");

    isScanning = true;
    if ($("historyList")) {
      $("historyList").style.pointerEvents = "none";
      $("historyList").style.opacity = "0.5";
    }
    
    if (currentMeta) currentMeta.textContent = `${name}`;
    if ($("scanId")) $("scanId").textContent = "Generating...";
    if (currentImg) {
      currentImg.src = image;
    }
    if ($("originalImg")) {
      $("originalImg").src = image;
    }
    if (emptyState) emptyState.style.display = "none";
    if (analysisContent) analysisContent.style.display = "block";

    // Trigger Scan Animation
    const overlay = $("scanLoader");
  const percentEl = $("scanPercentage");
  const analysisText = $("analysisText");
  const imgLoader = $("imageLoader");

  let scanInterval = null;
    
    if (overlay) {
  overlay.style.display = "flex";  // Remove inline none, add flex
  overlay.classList.add("active");
}
if (imgLoader) {
  imgLoader.style.display = "flex";  // Remove inline none, add flex
  imgLoader.classList.add("active");

      if (currentImg) currentImg.style.filter = "grayscale(1) brightness(0.3)";
      
      let currentPercent = 0;
      const statusMessages = [
        "Initializing neural core...",
        "Extracting facial feature maps...",
        "Analyzing texture anomalies...",
        "Calculating entropy gradients...",
        "Cross-referencing GAN signatures...",
        "Finalizing forensic report..."
      ];
      
      scanInterval = setInterval(() => {
        let increment = 1;
        if (currentPercent < 60) increment = Math.floor(Math.random() * 5) + 2;
        else if (currentPercent < 85) increment = Math.floor(Math.random() * 2) + 1;
        else increment = Math.random() > 0.7 ? 1 : 0;

        currentPercent += increment;
        if (currentPercent >= 99) {
          currentPercent = 99;
        }
        
        if (percentEl) percentEl.textContent = `${currentPercent}%`;
        
        if (analysisText && currentPercent % 15 === 0) {
          const msgIdx = Math.min(Math.floor(currentPercent / 15), statusMessages.length - 1);
          analysisText.textContent = statusMessages[msgIdx];
        }
      }, 150);
    }

    setIndicator({ labelText: "INFERENCE IN PROGRESS", statusText: "RUNNING", modelLoaded: false });

    // Hide Neural Explanation during scan
    const neuralCard = $("neuralExplanationCard");
    if (neuralCard) {
      neuralCard.style.display = "none";
    }

    // 🔥 FIX: Try to get the original raw File from IndexedDB to preserve metadata
      let originalFile = await getOriginalFile();
      
      // 🔥 Optimization: Resize image if it's too large (> 1MB) to prevent 502 timeouts
      if (originalFile && originalFile.size > 1024 * 1024) {
        console.log(`[Optimizer] Resizing large file (${(originalFile.size / 1024 / 1024).toFixed(2)}MB) before upload.`);
        originalFile = await resizeImage(originalFile, 1024);
      }

      const data = await predictBinaryFile(originalFile || dataUrlToBlob(image), name);
      
      // 🔥 FIX: Stop animation safely
      if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
      }
      
      if (overlay) {
        if (percentEl) {
          percentEl.textContent = "100%";
          percentEl.style.color = "#10b981";
        }
        if (analysisText) analysisText.textContent = "Analysis payload complete.";
        
        // 🔥 FIX: Update heatmap BEFORE hiding overlay
        if (data.heatmap && currentImg) {
          currentImg.src = `data:image/jpeg;base64,${data.heatmap}`;
        }

        await new Promise(r => setTimeout(r, 600));
        
        // Properly hide loader - remove active class AND set display none
overlay.classList.remove("active");
overlay.style.display = "none";  // 🔥 ADD THIS LINE
if (imgLoader) {
    imgLoader.classList.remove("active");
    imgLoader.style.display = "none";  // 🔥 ADD THIS LINE
}
if (currentImg) currentImg.style.filter = "none";
      }

      // 🔥 FIX: Robust prediction parsing
      let prediction = "Real"; // Default
      
      if (data.prediction) {
        const predStr = String(data.prediction).toLowerCase().trim();
        if (predStr === "fake" || predStr === "synthetic" || predStr === "ai") {
          prediction = "Fake";
        } else if (predStr === "real" || predStr === "authentic" || predStr === "genuine") {
          prediction = "Real";
        }
      }
      
      // 🔥 FIX: Robust confidence parsing
      let confidence = 0.5;
      if (typeof data.confidence === "number" && !isNaN(data.confidence)) {
        confidence = Math.max(0, Math.min(1, data.confidence));
      } else if (typeof data.ensemble_score === "number") {
        confidence = Math.max(0, Math.min(1, data.ensemble_score));
      }
      
      const modelLoaded = Boolean(data.model_loaded || data.modelLoaded);
      const explanation = String(data.explanation || data.message || "Analysis complete.");
      const heatmap = data.heatmap ? (data.heatmap.startsWith("data:") ? data.heatmap : `data:image/jpeg;base64,${data.heatmap}`) : null;
      const id = data.scan_id || `scan_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const debug_scores = data.debug_scores || {};
      const ensemble_score = data.ensemble_score || confidence;
      const forensic_profiles = data.forensic_profiles || {};
      const visual_data = data.visual_data || {};

      const item = { 
        id, 
        ts, 
        name, 
        thumb, 
        image: data.image || image, 
        originalImage: data.originalImage || data.crop_image || image,
        prediction, 
        confidence, 
        modelLoaded, 
        explanation, 
        heatmap,
        scan_id: data.scan_id,
        debug_scores: debug_scores,
        ensemble_score: ensemble_score,
        forensic_profiles: forensic_profiles,
        visual_data: visual_data
      };
      
      history = [item, ...history];
      saveHistory(history);
      
      isScanning = false;
      if ($("historyList")) {
        $("historyList").style.pointerEvents = "auto";
        $("historyList").style.opacity = "1";
      }
      
      renderHistory(history, pick);
      setCurrent(item);
      
      // Update D3 visuals for the current scan result
      updateForensicVisuals(item);
    } catch (e) {
      // 🔥 FIX: Stop animation on error too
      isScanning = false;
      if ($("historyList")) {
        $("historyList").style.pointerEvents = "auto";
        $("historyList").style.opacity = "1";
      }
      if (scanInterval) {
        clearInterval(scanInterval);
      }
      if (overlay) {
    overlay.classList.remove("active");  // 🔥 was: add("active") - yeh galat tha!
    overlay.style.display = "none";      // 🔥 ADD THIS LINE
}
if (imgLoader) {
    imgLoader.classList.remove("active");
    imgLoader.style.display = "none";      // 🔥 ADD THIS LINE
}
if (currentImg) currentImg.style.filter = "none";
      
      console.error("Scan error:", e);
      setIndicator({ 
        labelText: "ERROR", 
        statusText: "FAILED",
        explanation: e.message || "Unknown forensic analysis error."
      });
      
      if (currentMeta) {
        // Keep the filename, but clear the scan ID on failure
        if ($("scanId")) $("scanId").textContent = "N/A (Failed)";
      }
      
      // Ensure the explanation card is shown to display the error message
      const neuralCard = $("neuralExplanationCard");
      if (neuralCard) {
        neuralCard.style.display = "flex";
      }
    }
  }

  if (newFile) {
    newFile.addEventListener("change", async () => {
      const file = newFile.files && newFile.files[0];
      if (!file) return;
      // 🔥 Store binary-safe original before reload
      await storeOriginalFile(file);
      const mainDataUrl = await fileToResizedDataUrl(file, 1200, 0.86);
      const thumbDataUrl = await fileToResizedDataUrl(file, 220, 0.72);
      sessionStorage.setItem("verifex.current.image", mainDataUrl);
      sessionStorage.setItem("verifex.current.thumb", thumbDataUrl);
      sessionStorage.setItem("verifex.current.name", file.name || "image");
      sessionStorage.setItem("verifex.current.ts", nowIso());
      window.location.reload();
    });
  }

  const emptyStateFile = $("emptyStateFile");
  if (emptyStateFile) {
    emptyStateFile.addEventListener("change", async () => {
      const file = emptyStateFile.files && emptyStateFile.files[0];
      if (!file) return;
      // 🔥 Store binary-safe original before reload
      await storeOriginalFile(file);
      const mainDataUrl = await fileToResizedDataUrl(file, 1200, 0.86);
      const thumbDataUrl = await fileToResizedDataUrl(file, 220, 0.72);
      sessionStorage.setItem("verifex.current.image", mainDataUrl);
      sessionStorage.setItem("verifex.current.thumb", thumbDataUrl);
      sessionStorage.setItem("verifex.current.name", file.name || "image");
      sessionStorage.setItem("verifex.current.ts", nowIso());
      window.location.reload();
    });
  }

  clearHistoryBtn.addEventListener("click", () => {
    // Show delete modal
    const modal = $("deleteHistoryModal");
    if (!modal) return;
    
    // Reset modal text if it was changed by the limit check
    const title = modal.querySelector("h2");
    const desc = modal.querySelector("p");
    if (title) title.textContent = "Delete History Items";
    if (desc) desc.textContent = "Once reached the limit of 10 saved scans. The app will be unable to take in more images, please delete one or more previous results from your History. This action cannot be undone.";
    
    // Populate modal with current history items
    const deleteList = $("deleteHistoryList");
    if (!deleteList) return;
    
    deleteList.innerHTML = "";
    if (history.length === 0) {
      deleteList.innerHTML = '<div style="color: var(--text-secondary); padding: 20px; text-align: center;">No history to delete</div>';
    } else {
      history.forEach((item) => {
        const itemDiv = document.createElement("div");
        itemDiv.style.cssText = "display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; cursor: pointer;";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = item.scan_id || item.id;
        checkbox.style.cssText = "width: 18px; height: 18px; cursor: pointer;";
        checkbox.dataset.itemId = item.id;
        
        const labelDiv = document.createElement("div");
        labelDiv.style.cssText = "flex: 1; cursor: pointer;";
        labelDiv.innerHTML = `
          <div style="font-weight: 500; color: var(--text-primary);">${item.name || "Scan"}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">ID: ${item.scan_id || item.id}</div>
        `;
        
        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(labelDiv);
        
        // Click on label to toggle checkbox
        labelDiv.addEventListener("click", () => {
          checkbox.checked = !checkbox.checked;
          updateSelectAllCheckbox();
        });
        
        // Update select all when individual checkbox changes
        checkbox.addEventListener("change", updateSelectAllCheckbox);
        
        deleteList.appendChild(itemDiv);
      });
    }
    
    modal.style.display = "flex";
  });
  
  // Handle Select All checkbox
  function updateSelectAllCheckbox() {
    const selectAll = $("selectAllCheckbox");
    const checkboxes = document.querySelectorAll("#deleteHistoryList input[type='checkbox']");
    const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
    selectAll.checked = checked === checkboxes.length && checkboxes.length > 0;
    selectAll.indeterminate = checked > 0 && checked < checkboxes.length;
  }
  
  const selectAllCheckbox = $("selectAllCheckbox");
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", (e) => {
      const checkboxes = document.querySelectorAll("#deleteHistoryList input[type='checkbox']");
      checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
  }
  
  // Close modal
  const closeDeleteModal = $("closeDeleteModal");
  const cancelDeleteBtn = $("cancelDeleteBtn");
  const deleteModal = $("deleteHistoryModal");
  
  if (closeDeleteModal) {
    closeDeleteModal.addEventListener("click", () => {
      if (deleteModal) deleteModal.style.display = "none";
    });
  }
  
  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener("click", () => {
      if (deleteModal) deleteModal.style.display = "none";
    });
  }
  
  // Confirm delete
  const confirmDeleteBtn = $("confirmDeleteBtn");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      const checkboxes = document.querySelectorAll("#deleteHistoryList input[type='checkbox']:checked");
      const selectedIds = Array.from(checkboxes).map(cb => cb.value);
      
      if (selectedIds.length === 0) {
        alert("Please select at least one item to delete");
        return;
      }
      
      // Get user ID from localStorage
      const raw = localStorage.getItem("verifex.user");
      let userId = null;
      if (raw) {
        try {
          const user = JSON.parse(raw);
          userId = user.id;
        } catch (e) {}
      }
      
      if (!userId) {
        alert("User not logged in");
        return;
      }
      
      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.textContent = "Deleting...";
      
      try {
        const res = await fetch("/api/delete-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, scanIds: selectedIds })
        });
        
        if (res.ok) {
          // Remove deleted items from local history
          history = history.filter(item => !selectedIds.includes(item.scan_id || item.id));
          saveHistory(history);
          
          // Close modal
          if (deleteModal) deleteModal.style.display = "none";
          
          // Update UI
          renderHistory(history, pick);
          if (history.length === 0) {
            if (emptyState) emptyState.style.display = "block";
            if (analysisContent) analysisContent.style.display = "none";
          } else {
            // Select first item
            if (history.length) pick(history[0].id);
          }
        } else {
          console.error("Failed to delete history from server");
          alert("Failed to delete history");
        }
      } catch (e) {
        console.error("Error deleting history:", e);
        alert("Error deleting history: " + e.message);
      } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = "Delete Selected";
      }
    });
  }
  
  // Close modal when clicking outside
  if (deleteModal) {
    deleteModal.addEventListener("click", (e) => {
      if (e.target === deleteModal) {
        deleteModal.style.display = "none";
      }
    });
  }

  runScanFromSession();
}

// --- CLERK INTEGRATION ---
const CLERK_PUBLISHABLE_KEY =
  window.__CLERK_PUBLISHABLE_KEY__ ||
  "pk_test_ZW5hYmxpbmctaGF3ay00My5jbGVyay5hY2NvdW50cy5kZXYk";
const CLERK_REDIRECT_URL = `${window.location.origin}/index.html`;
const CLERK_CALLBACK_URL = `${window.location.origin}/signup.html`;
let clerkInitPromise = null;

function persistAuthUser(user) {
  const currentUser = getStoredAuthUser() || {};
  localStorage.setItem("verifex.user", JSON.stringify({
    ...currentUser,
    ...user,
    ts: nowIso()
  }));
}

function ensureAccountMenu() {
  const navActions = document.querySelector(".nav-actions");
  const userProfile = $("userProfile");
  if (!navActions || !userProfile) return null;

  let accountMenu = $("accountMenu");
  if (!accountMenu) {
    accountMenu = document.createElement("div");
    accountMenu.id = "accountMenu";
    accountMenu.className = "account-menu";
    accountMenu.innerHTML = `
      <button type="button" class="account-menu-trigger" id="accountMenuTrigger" aria-expanded="false" aria-label="Open account menu">
        <div class="account-menu-label">
          <span class="account-menu-name" id="accountMenuName">User</span>
          <span class="account-menu-email" id="accountMenuEmail"></span>
        </div>
        <svg class="account-menu-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"></path>
        </svg>
      </button>
      <div class="account-dropdown" id="accountDropdown">
        <button type="button" id="accountSettingsBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 3.4l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 2.28V2a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 20.72 7l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span>Settings</span>
        </button>
        <button type="button" id="accountThemeBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3a6 6 0 0 0 0 12 9 9 0 1 1 0-12z"></path>
          </svg>
          <span id="accountThemeLabel">Change Theme</span>
        </button>
        <button type="button" id="accountLogoutBtn" class="logout-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <path d="M16 17l5-5-5-5"></path>
            <path d="M21 12H9"></path>
          </svg>
          <span>Logout</span>
        </button>
      </div>
    `;
    navActions.insertBefore(accountMenu, navActions.firstChild);

    const trigger = $("accountMenuTrigger");
    const dropdown = $("accountDropdown");
    trigger.prepend(userProfile);

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains("open");
      dropdown.classList.toggle("open", !isOpen);
      trigger.classList.toggle("open", !isOpen);
      trigger.setAttribute("aria-expanded", (!isOpen).toString());
    });

    document.addEventListener("click", (e) => {
      if (!accountMenu.contains(e.target)) {
        dropdown.classList.remove("open");
        trigger.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });

    $("accountSettingsBtn")?.addEventListener("click", () => {
      openSettingsModal();
      dropdown.classList.remove("open");
      trigger.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    });
    $("accountThemeBtn")?.addEventListener("click", () => {
      toggleThemePreference();
      dropdown.classList.remove("open");
      trigger.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    });
    $("accountLogoutBtn")?.addEventListener("click", logout);
  }

  return {
    accountMenu,
    dropdown: $("accountDropdown"),
    trigger: $("accountMenuTrigger"),
    name: $("accountMenuName"),
    email: $("accountMenuEmail"),
  };
}

function updateAccountThemeLabel() {
  const label = $("accountThemeLabel");
  if (!label) return;
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  label.textContent = isDark ? "Light Theme" : "Dark Theme";
}

function renderAccountMenu(user) {
  const refs = ensureAccountMenu();
  if (!refs) return;
  refs.accountMenu.classList.add("visible");
  if ($("userProfile")) $("userProfile").style.display = "flex";
  refs.name.textContent = getUserDisplayName(user);
  refs.email.textContent = user?.email || "";
  setAvatarElement($("userProfile"), user);
  updateAccountThemeLabel();
}

function closeSettingsModal() {
  $("settingsModal")?.classList.remove("open");
}

function setSettingsMessage(message, type) {
  const status = $("settingsStatus");
  if (!status) return;
  status.textContent = message || "";
  status.className = "settings-message";
  if (type) status.classList.add(type);
}

function updateSettingsAvatarPreview(dataUrl) {
  const preview = $("settingsAvatarPreview");
  const user = getStoredAuthUser();
  if (!preview) return;
  setAvatarElement(preview, {
    ...user,
    profileImage: dataUrl || user?.profileImage || "",
  });
}

function ensureSettingsModal() {
  let modal = $("settingsModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "settingsModal";
  modal.className = "settings-modal";
  modal.innerHTML = `
    <div class="settings-modal-content">
      <div class="settings-modal-header">
        <div>
          <h2>Account Settings</h2>
          <p>Manage your profile, email, and password settings here.</p>
        </div>
        <button type="button" class="settings-modal-close" id="settingsModalClose" aria-label="Close settings">×</button>
      </div>
      <form id="settingsForm">
        <div class="settings-avatar-row">
          <div class="settings-avatar-preview" id="settingsAvatarPreview">U</div>
          <div class="settings-avatar-actions">
            <label class="settings-upload-btn" for="settingsProfileImage">Update Profile Picture</label>
            <input type="file" id="settingsProfileImage" accept="image/png,image/jpeg,image/webp" style="display:none;" />
            <div class="settings-help" id="settingsProviderHint">For the best result, upload a square image.</div>
          </div>
        </div>
        <div class="settings-grid">
          <div class="settings-field">
            <label for="settingsEmail">Email</label>
            <input type="email" id="settingsEmail" placeholder="your@email.com" />
          </div>
          <div class="settings-field">
            <label for="settingsCurrentPassword">Current Password</label>
            <input type="password" id="settingsCurrentPassword" placeholder="Enter your current password" />
          </div>
          <div class="settings-field">
            <label for="settingsNewPassword">New Password</label>
            <input type="password" id="settingsNewPassword" placeholder="At least 8 characters" />
          </div>
          <div class="settings-field">
            <label for="settingsConfirmPassword">Confirm New Password</label>
            <input type="password" id="settingsConfirmPassword" placeholder="Re-enter your new password" />
          </div>
        </div>
        <div class="settings-message" id="settingsStatus"></div>
        <div class="settings-actions">
          <button type="button" class="btn" id="settingsCancelBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="settingsSaveBtn">Save Changes</button>
        </div>
        
        <div style="margin-top: 32px; border: 1px solid var(--danger-color); border-radius: 8px; background: rgba(var(--color-surface-rgb), 0.5); text-align: left;">
          <div style="padding: 20px;">
            <h3 style="margin: 0 0 8px 0; font-size: 1rem; font-weight: 600; color: var(--text-primary);">Delete Personal Account</h3>
            <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
              Permanently remove your Personal Account and all of its contents from the Verifex platform. This action is not reversible, so please continue with caution.
            </p>
          </div>
          <div style="background: rgba(244, 63, 94, 0.05); padding: 12px 20px; border-top: 1px solid rgba(244, 63, 94, 0.2); display: flex; justify-content: flex-end;">
            <button type="button" class="btn" style="background: var(--danger-color); color: white; border: none; font-weight: 500; font-size: 0.85rem; padding: 8px 16px; border-radius: 6px;" id="settingsDeleteBtn">Delete Personal Account</button>
          </div>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  $("settingsModalClose")?.addEventListener("click", closeSettingsModal);
  $("settingsCancelBtn")?.addEventListener("click", closeSettingsModal);
  $("settingsDeleteBtn")?.addEventListener("click", handleDeleteAccount);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeSettingsModal();
  });
  $("settingsProfileImage")?.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    pendingProfileImageDataUrl = await fileToResizedDataUrl(file, 320, 0.9);
    updateSettingsAvatarPreview(pendingProfileImageDataUrl);
  });
  $("settingsForm")?.addEventListener("submit", handleSettingsSubmit);

  return modal;
}

function openSettingsModal() {
  const modal = ensureSettingsModal();
  const user = getStoredAuthUser();
  if (!user) return;

  pendingProfileImageDataUrl = user.profileImage || "";
  if ($("settingsEmail")) $("settingsEmail").value = user.email || "";
  if ($("settingsCurrentPassword")) $("settingsCurrentPassword").value = "";
  if ($("settingsNewPassword")) $("settingsNewPassword").value = "";
  if ($("settingsConfirmPassword")) $("settingsConfirmPassword").value = "";
  if ($("settingsProviderHint")) {
    $("settingsProviderHint").textContent = user.clerkId
      ? "Google/Clerk account email and password must be updated from the Clerk dashboard. You can still update the profile picture here."
      : "You must enter your current password before changing your email or password.";
  }
  setSettingsMessage("", "");
  updateSettingsAvatarPreview(pendingProfileImageDataUrl);
  modal.classList.add("open");
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const user = getStoredAuthUser();
  if (!user) return;

  const email = $("settingsEmail")?.value.trim() || "";
  const currentPassword = $("settingsCurrentPassword")?.value || "";
  const newPassword = $("settingsNewPassword")?.value || "";
  const confirmPassword = $("settingsConfirmPassword")?.value || "";
  const saveBtn = $("settingsSaveBtn");

  if (!email) {
    setSettingsMessage("Email is required.", "error");
    return;
  }

  if (newPassword && newPassword.length < 8) {
    setSettingsMessage("The new password must be at least 8 characters long.", "error");
    return;
  }

  if (newPassword && newPassword !== confirmPassword) {
    setSettingsMessage("The new password and confirmation password do not match.", "error");
    return;
  }

  if (user.clerkId && ((email && email !== user.email) || newPassword)) {
    setSettingsMessage("Google/Clerk account email or password must be changed in Clerk. You can still update your profile picture here.", "error");
    return;
  }

  const payload = {
    currentUserId: user.id,
    currentEmail: user.email,
    newEmail: email !== user.email ? email : "",
    currentPassword: currentPassword || "",
    newPassword: newPassword || "",
    profileImage: pendingProfileImageDataUrl || user.profileImage || "",
  };

  setSettingsMessage("Saving changes...", "");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
  }

  try {
    const res = await fetch("/api/account-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await parseResponse(res);

    persistAuthUser({
      ...data,
      clerkId: user.clerkId || "",
    });
    renderAccountMenu(getStoredAuthUser());
    setSettingsMessage("Settings were updated successfully.", "success");
    setTimeout(() => closeSettingsModal(), 500);
  } catch (err) {
    setSettingsMessage(toSettingsError(err.message) || "Settings could not be saved.", "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
    }
  }
}

async function handleDeleteAccount() {
  const user = getStoredAuthUser();
  if (!user) return;

  const confirmMsg = "Are you sure you want to delete your account?\n\nYour account will be scheduled for deletion in 30 days. If you login before 30 days, the deletion will be cancelled.\n\nIf the deletion completes and you later create an account again with the same email, your previous scans will be hidden from your history.";
  if (!confirm(confirmMsg)) {
    return;
  }

  const deleteBtn = $("settingsDeleteBtn");
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Scheduling...";
  }
  setSettingsMessage("Scheduling account deletion...", "");

  try {
    const res = await fetch("/api/schedule-deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.userId || user.id, email: user.email || "" }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to schedule deletion");

    setSettingsMessage("Account scheduled for deletion. Logging out...", "success");
    setTimeout(() => {
      logout();
    }, 2000);
  } catch (err) {
    setSettingsMessage(err.message, "error");
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete Account";
    }
  }
}

function toggleThemePreference() {
  if (!applyThemePreference) return;
  const nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyThemePreference(nextTheme);
}

function getClerkPrimaryEmail() {
  if (!window.Clerk || !Clerk.user) return "";
  return Clerk.user.primaryEmailAddress?.emailAddress || Clerk.user.emailAddresses?.[0]?.emailAddress || "";
}

function isClerkOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.has("state") ||
    params.has("code") ||
    params.has("__clerk_status") ||
    params.has("rotating_token_nonce")
  );
}

function getClerkErrorMessage(err, fallbackMessage) {
  if (!err) return fallbackMessage;
  if (Array.isArray(err.errors) && err.errors.length) {
    const first = err.errors[0];
    const code = String(first?.code || "").toLowerCase();
    const longMessage = typeof first?.longMessage === "string" ? first.longMessage.trim() : "";
    const message = typeof first?.message === "string" ? first.message.trim() : "";
    const combined = `${code} ${longMessage} ${message}`.toLowerCase();

    if (page === "login") {
      if (combined.includes("identifier_not_found") || combined.includes("form_identifier_not_found") || combined.includes("account not found")) {
        return "No account was found for this Google email. Please create an account from the signup page.";
      }
    }
    if (page === "signup") {
      if (combined.includes("identifier_exists") || combined.includes("form_identifier_exists") || combined.includes("already exists")) {
        return "An account already exists for this Google email. Please sign in from the login page.";
      }
    }

    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
    if (first?.code) return `Clerk error: ${first.code}`;
  }
  if (typeof err.message === "string" && err.message.trim()) return err.message.trim();
  return fallbackMessage;
}

async function startClerkGoogleAuth() {
  const mode = page === "signup" ? "signup" : "login";
  const signUpResource = Clerk.signUp || Clerk.client?.signUp;
  const signInResource = Clerk.signIn || Clerk.client?.signIn;

  const resource = mode === "signup" ? signUpResource : signInResource;
  if (resource && typeof resource.authenticateWithRedirect === "function") {
    await resource.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: CLERK_CALLBACK_URL,
      redirectUrlComplete: CLERK_REDIRECT_URL,
    });
    return;
  }

  throw new Error("Google sign-in is not available right now. Please use email and password.");
}

async function completeClerkOAuthCallback() {
  if (!window.Clerk || (page !== "login" && page !== "signup") || !isClerkOAuthCallback()) {
    return false;
  }

  const statusEl = $("authStatus");
  if (statusEl) statusEl.textContent = "Completing Google sign-in...";

  await Clerk.handleRedirectCallback({
    signInForceRedirectUrl: CLERK_REDIRECT_URL,
    signUpForceRedirectUrl: CLERK_REDIRECT_URL,
  });

  return true;
}

function bindClerkGoogleButton() {
  if (page !== "login" && page !== "signup") return;
  const googleBtn = $("googleAuthBtn");
  const statusEl = $("authStatus");
  if (!googleBtn || googleBtn.dataset.clerkBound === "true") return;

  googleBtn.dataset.clerkBound = "true";
  googleBtn.addEventListener("click", async () => {
    if (!window.Clerk) {
      if (statusEl) statusEl.textContent = "Google sign-in is still loading. Please try again.";
      return;
    }

    if (statusEl) statusEl.textContent = "Preparing Google sign-in...";
    googleBtn.disabled = true;

    try {
      await startClerkGoogleAuth();
    } catch (err) {
      console.error("Clerk Google auth failed:", err);
      googleBtn.disabled = false;
      if (statusEl) statusEl.textContent = getClerkErrorMessage(err, "Unable to start Google sign-in.");
    }
  });
}

async function initClerk() {
  if (clerkInitPromise) return clerkInitPromise;
  if (!CLERK_PUBLISHABLE_KEY) return null;

  clerkInitPromise = new Promise((resolve) => {
    const onReady = async () => {
      try {
        await Clerk.load();
        await completeClerkOAuthCallback();
        await handleClerkState();
        resolve(Clerk);
      } catch (err) {
        console.error("Clerk load failed:", err);
        resolve(null);
      }
    };

    if (typeof Clerk === "undefined") {
      const script = document.createElement("script");
      script.setAttribute("data-clerk-publishable-key", CLERK_PUBLISHABLE_KEY);
      script.async = true;
      script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";
      script.onload = onReady;
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    } else {
      onReady();
    }
  });

  return clerkInitPromise;
}

async function handleClerkState() {
  bindClerkGoogleButton();

  if (!window.Clerk || !Clerk.user) return;
  const statusEl = $("authStatus");

  try {
    const convexUser = await syncClerkUserWithConvex();
    if (!convexUser?.id || !convexUser?.email) {
      throw new Error("Verified user sync response invalid.");
    }

    persistAuthUser({
      id: convexUser.id,
      email: convexUser.email,
      name: convexUser.name || Clerk.user.fullName || "Clerk User",
      profileImage: convexUser.profileImage || "",
      clerkId: Clerk.user.id,
    });
    renderAccountMenu(getStoredAuthUser());
    checkAuth();
  } catch (err) {
    console.error("Clerk-Convex Sync failed:", err);
    localStorage.removeItem("verifex.user");
    if (statusEl) statusEl.textContent = getClerkErrorMessage(err, "Google sign-in could not be verified. Please try again.");
    return;
  }

  if (page === "login" || page === "signup") {
    window.location.href = "/index.html";
  }
}

async function syncClerkUserWithConvex() {
  if (!window.Clerk || !Clerk.user) return null;

  let sessionToken = "";
  try {
    sessionToken = Clerk.session
      ? await Clerk.session.getToken({ template: "convex" })
      : "";
  } catch (err) {
    console.error("Clerk session token unavailable:", err);
  }

  if (!sessionToken) {
    throw new Error("Missing Clerk JWT template token for 'convex'. Create a JWT template named 'convex' in Clerk Dashboard.");
  }

  const res = await fetch("/api/clerk-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionToken,
      user: {
        id: Clerk.user.id,
        email: getClerkPrimaryEmail(),
        name: Clerk.user.fullName || "",
      }
    })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Clerk sync failed.");
  }

  return await res.json();
}

// Initialize Clerk on load
initClerk();

function initAuth() {
  const loginForm = $("loginForm");
  const signupForm = $("signupForm");
  const statusEl = $("authStatus");
  const loginPwd = $("loginPassword");
  const signupPwd = $("signupPassword");
  const loginToggle = $("loginTogglePwd");
  const signupToggle = $("signupTogglePwd");
  const loginSubmit = $("loginSubmit");
  const signupSubmit = $("signupSubmit");
  bindClerkGoogleButton();

  // Vibrate on Arrival Logic
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('reason') === 'auth_required') {
    const authCard = document.querySelector('.auth-card');
    const messageBox = document.getElementById('authMessage');
    
    if (messageBox) {
      messageBox.textContent = "Authentication Required to move on.";
      messageBox.style.color = "#f43f5e"; // Professional Red
      messageBox.style.opacity = "1";
    }

    if (authCard) {
      authCard.classList.remove('vibrate-error');
      void authCard.offsetWidth; // Trigger reflow
      authCard.classList.add('vibrate-error');
      setTimeout(() => authCard.classList.remove('vibrate-error'), 400);
    }

    // Cleanup URL
    setTimeout(() => {
      const url = new URL(window.location);
      url.searchParams.delete("reason");
      window.history.replaceState({}, document.title, url);
    }, 1000);
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function toAuthErrorMessage(rawMessage, mode) {
    const raw = String(rawMessage || "").trim();
    const cleaned = raw
      .replace(/^\[Request ID:[^\]]+\]\s*/i, "")
      .replace(/^Server Error\s*/i, "")
      .replace(/^Uncaught Error:\s*/i, "")
      .replace(/\s+at handler\s*\(.*$/i, "")
      .trim();
    const normalized = cleaned.toLowerCase();

    if (!cleaned) {
      return mode === "signup"
        ? "We couldn't create your account. Please try again."
        : "We couldn't sign you in. Please try again.";
    }
    if (normalized.includes("incorrect email or password") || normalized.includes("password not match")) {
      return "Incorrect email or password.";
    }
    if (normalized.includes("account not found")) {
      return mode === "login"
        ? "No account was found for this email address. Please create an account on the signup page."
        : "No account was found for this email address.";
    }
    if (normalized.includes("user already exists") || normalized.includes("already exists with this email")) {
      return mode === "signup"
        ? "An account with this email already exists. Please sign in on the login page."
        : "An account with this email already exists. Please sign in instead.";
    }
    if (normalized.includes("password must be at least 8 characters")) {
      return "Password must be at least 8 characters long.";
    }
    if (normalized.includes("backend is offline") || normalized.includes("service is temporarily unavailable")) {
      return "The service is temporarily unavailable. Please try again in a moment.";
    }
    return cleaned;
  }

  function setUser(user) {
    persistAuthUser(user);
  }

  if (loginToggle && loginPwd) {
    loginToggle.addEventListener("click", () => {
      const isPwd = loginPwd.type === "password";
      loginPwd.type = isPwd ? "text" : "password";
      loginToggle.textContent = isPwd ? "Hide" : "Show";
    });
  }
  if (signupToggle && signupPwd) {
    signupToggle.addEventListener("click", () => {
      const isPwd = signupPwd.type === "password";
      signupPwd.type = isPwd ? "text" : "password";
      signupToggle.textContent = isPwd ? "Hide" : "Show";
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("loginEmail").value.trim();
      const password = $("loginPassword") ? $("loginPassword").value : "123456";
      if (!email || !password) {
        setStatus("Please enter email and password.");
        return;
      }
      if (password.length < 8) {
        setStatus("Password must be at least 8 characters.");
        return;
      }
      setStatus("Logging in...");
      if (loginSubmit) {
        loginSubmit.disabled = true;
        loginSubmit.textContent = "Please wait...";
      }
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setUser({
            id: data.id,
            email: data.email,
            name: data.name || "",
            profileImage: data.profileImage || "",
          });
          setStatus("Login successful.");
          setTimeout(() => {
            window.location.href = "/index.html";
          }, 450);
        } else {
          setStatus(toAuthErrorMessage(data.error, "login"));
          const authCard = document.querySelector(".auth-card");
          if (authCard) {
            authCard.classList.remove("vibrate-error");
            void authCard.offsetWidth;
            authCard.classList.add("vibrate-error");
          }
        }
      } catch (err) {
        setStatus("Unable to connect right now. Please check your internet connection and try again.");
      } finally {
        if (loginSubmit) {
          loginSubmit.disabled = false;
          loginSubmit.textContent = "Sign In";
        }
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("signupName").value.trim();
      const email = $("signupEmail").value.trim();
      const password = $("signupPassword") ? $("signupPassword").value : "123456";
      const authCard = document.querySelector(".auth-card");
      const triggerVibration = () => {
        if (authCard) {
          authCard.classList.remove("vibrate-error");
          void authCard.offsetWidth;
          authCard.classList.add("vibrate-error");
        }
      };

      if (!name || !email || !password) {
        setStatus("Please fill in all fields.");
        triggerVibration();
        return;
      }
      if (password.length < 8) {
        setStatus("Password must be at least 8 characters.");
        triggerVibration();
        return;
      }
      setStatus("Creating account...");
      if (signupSubmit) {
        signupSubmit.disabled = true;
        signupSubmit.textContent = "Please wait...";
      }

      // Generate userId from email prefix + 4 random digits
      const emailPrefix = email.split("@")[0];
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      const generatedUserId = `${emailPrefix}_${randomDigits}`;

      try {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: generatedUserId, name, email, password })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setStatus("Account created successfully! Redirecting to login...");
          setTimeout(() => {
            window.location.href = "/login.html";
          }, 1500);
        } else {
          setStatus(toAuthErrorMessage(data.error, "signup"));
          triggerVibration();
        }
      } catch (err) {
        setStatus("Unable to connect right now. Please check your internet connection and try again.");
      } finally {
        if (signupSubmit) {
          signupSubmit.disabled = false;
          signupSubmit.textContent = "Get Started";
        }
      }
    });
  }

}

function checkAuth() {
  const user = getStoredAuthUser();
  const navLoginBtn = $("navLoginBtn");
  const navSignupBtn = $("navSignupBtn");
  const navLogoutBtn = $("navLogoutBtn");
  const themeToggle = $("themeToggle");
  const mobileLogoutBtn = document.querySelector(".mobile-login");
  const mobileSignupBtn = document.querySelector(".mobile-signup");

  // --- Dashboard Route Protection ---
  if (!user && page === "dashboard") {
    window.location.href = "/login.html?error=unauthorized";
    return;
  }

  // --- Auth Page Error Animation ---
  if ((page === "login" || page === "signup") && window.location.search.includes("error=unauthorized")) {
    const authCard = document.querySelector(".auth-card");
    if (authCard) {
      authCard.classList.add("vibrate-error");
      
      const statusEl = document.getElementById("authStatus");
      if (statusEl) {
        statusEl.textContent = "Please sign in or create an account to access the dashboard.";
        statusEl.style.color = "var(--danger-color)";
      }

      // Optional: Clean up URL after animation starts
      setTimeout(() => {
        const url = new URL(window.location);
        url.searchParams.delete("error");
        window.history.replaceState({}, document.title, url);
      }, 1000);
    }
  }

  if (user) {
    if (navLoginBtn) navLoginBtn.style.display = "none";
    if (navSignupBtn) navSignupBtn.style.display = "none";
    if (navLogoutBtn) navLogoutBtn.style.display = "none";
    if (themeToggle) themeToggle.style.display = "none";
    renderAccountMenu(user);
    if (mobileLogoutBtn) {
      mobileLogoutBtn.textContent = "Logout";
      mobileLogoutBtn.onclick = logout;
      mobileLogoutBtn.href = "javascript:void(0)";
    }
    if (mobileSignupBtn) mobileSignupBtn.style.display = "none";
  } else {
    if (navLoginBtn) navLoginBtn.style.display = "";
    if (navSignupBtn) navSignupBtn.style.display = "";
    if (navLogoutBtn) navLogoutBtn.style.display = "none";
    if (themeToggle) themeToggle.style.display = "";
    if ($("accountMenu")) $("accountMenu").classList.remove("visible");
    if ($("userProfile")) $("userProfile").style.display = "none";
    if (mobileLogoutBtn) {
      mobileLogoutBtn.textContent = "Login";
      mobileLogoutBtn.onclick = () => { window.location.href = "/login.html"; };
      if (mobileLogoutBtn.tagName === "A") mobileLogoutBtn.href = "/login.html";
    }
    if (mobileSignupBtn) mobileSignupBtn.style.display = "flex";
  }
}

async function logout() {
  closeSettingsModal();
  localStorage.removeItem("verifex.user");
  if (typeof Clerk !== "undefined" && Clerk.user) {
    await Clerk.signOut();
  }
  window.location.href = "/login.html";
}

function initThree() {
  // Unifying background animation across all pages
  const canvas = $("canvas-bg");
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 100;

  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const size = 2000;

  for (let i = 0; i < 5000; i++) {
    const x = (Math.random() - 0.5) * size;
    const y = (Math.random() - 0.5) * size;
    const z = (Math.random() - 0.5) * size;
    vertices.push(x, y, z);
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

  const getThemeColor = () => {
    const theme = document.documentElement.getAttribute("data-theme");
    return theme === "light" ? 0x000000 : 0xffffff;
  };

  const material = new THREE.PointsMaterial({
    color: getThemeColor(),
    size: 1.5,
    transparent: true,
    opacity: 0.2,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  window.bgPoints = points;
  window.bgMaterial = material;

  let mouseX = 0;
  let mouseY = 0;

  document.addEventListener("mousemove", (event) => {
    mouseX = (event.clientX - window.innerWidth / 2) / 100;
    mouseY = (event.clientY - window.innerHeight / 2) / 100;
  });

  function animate() {
    requestAnimationFrame(animate);

    points.rotation.x += 0.0005;
    points.rotation.y += 0.0005;

    camera.position.x += (mouseX - camera.position.x) * 0.05;
    camera.position.y += (-mouseY - camera.position.y) * 0.05;
    
    // FORCE Z-DISTANCE: Restrict camera Z position to a tight, close range (Base 100)
    const targetZ = Math.max(95, Math.min(105, 100 + (mouseY * 0.002))); 
    camera.position.z += (targetZ - camera.position.z) * 0.02;

    camera.lookAt(scene.position);
    renderer.render(scene, camera);
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

function initTheme() {
  const themeToggle = $("themeToggle");
  const updateTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    
    if (window.bgMaterial) {
      const color = theme === "light" ? 0x000000 : 0xffffff;
      window.bgMaterial.color.setHex(color);
      window.bgMaterial.opacity = theme === "light" ? 0.05 : 0.2;
    }
    
    if (window.neuralMaterial && window.neuralLineMaterial) {
      const color = theme === "light" ? 0x000000 : 0xffffff;
      window.neuralMaterial.color.setHex(color);
      window.neuralLineMaterial.color.setHex(color);
      window.neuralMaterial.opacity = theme === "light" ? 0.6 : 0.8;
      window.neuralLineMaterial.opacity = theme === "light" ? 0.20 : 0.25;
    }
    
    const nav = document.querySelector('.nav');
    if (nav) {
      nav.style.transition = 'none';
      setTimeout(() => nav.style.transition = '', 10);
    }

    updateAccountThemeLabel();
  };
  applyThemePreference = updateTheme;

  const currentTheme = localStorage.getItem("theme") || "dark";
  updateTheme(currentTheme);
  
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      toggleThemePreference();
    });
  }
}

function showLoader() {
  const loader = $("pageLoader");
  if (loader) loader.classList.remove("hidden");
}

function hideLoader() {
  const loader = $("pageLoader");
  if (loader) {
    setTimeout(() => {
      loader.classList.add("hidden");
    }, 500);
  }
}

function initLinkInterceptors() {
  const isAuthenticated = () => !!localStorage.getItem("verifex.user");

  document.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href');
    
    // Global Dashboard Auth Check
    if (href && href.includes("dashboard.html")) {
      link.addEventListener('click', (e) => {
        if (!isAuthenticated()) {
          e.preventDefault();
          triggerLoginRequired();
        }
      });
      return;
    }

    // For #technology and #faqs, let the browser navigate naturally to index page sections
    if (href && (href.includes("#technology") || href.includes("#faqs"))) {
      return; 
    }

    if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !link.onclick) {
      link.addEventListener('click', (e) => {
        if (!e.ctrlKey && !e.shiftKey && !e.metaKey) {
          showLoader();
        }
      });
    }
  });

  document.querySelectorAll('button').forEach(btn => {
    if (btn.id === 'tryNowBtn' || btn.classList.contains('cta')) {
      btn.addEventListener('click', () => {
        // No artificial delay needed. Let the smooth scroll or action happen instantly.
      });
    }
  });
}

function initNeuralLink() {
  const canvas = $("neural-canvas");
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  
  const container = canvas.parentElement;
  const isFixed = window.getComputedStyle(canvas).position === 'fixed';
  
  const updateSize = () => {
    const width = isFixed ? window.innerWidth : container.clientWidth;
    const height = isFixed ? window.innerHeight : container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 2000);
  camera.position.z = 100; // Force camera significantly closer as requested (Base 100)

  const particleCount = 150; // Adjusted back to 150
  const particles = new THREE.BufferGeometry();
  const pPositions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    pPositions[i * 3] = (Math.random() - 0.5) * 800;
    pPositions[i * 3 + 1] = (Math.random() - 0.5) * 400;
    pPositions[i * 3 + 2] = (Math.random() - 0.5) * 400;
    velocities.push({
      x: (Math.random() - 0.5) * 0.5,
      y: (Math.random() - 0.5) * 0.5,
      z: (Math.random() - 0.5) * 0.5
    });
  }

  particles.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

  const getThemeColor = () => {
    const theme = document.documentElement.getAttribute("data-theme");
    return theme === "light" ? 0x000000 : 0xffffff; // Pure black for light theme to ensure maximum visibility
  };

  const pMaterial = new THREE.PointsMaterial({
    color: getThemeColor(),
    size: 3, // Slightly smaller for a cleaner look
    transparent: true,
    opacity: document.documentElement.getAttribute("data-theme") === "light" ? 0.6 : 0.8
  });

  const particleSystem = new THREE.Points(particles, pMaterial);
  scene.add(particleSystem);

  const linesMaterial = new THREE.LineBasicMaterial({
    color: getThemeColor(),
    transparent: true,
    opacity: document.documentElement.getAttribute("data-theme") === "light" ? 0.20 : 0.2, // Adjusted to 0.20 for an even more subtle look
    linewidth: 1
  });

  const linesGeometry = new THREE.BufferGeometry();
  const lineMesh = new THREE.LineSegments(linesGeometry, linesMaterial);
  scene.add(lineMesh);

  window.neuralMaterial = pMaterial;
  window.neuralLineMaterial = linesMaterial;

  updateSize();
  window.addEventListener('resize', updateSize);

  let mouseX = 0;
  let mouseY = 0;
  
  // Listen on window for broader mouse movement coverage
  window.addEventListener("mousemove", (event) => {
    if (isFixed) {
      mouseX = (event.clientX - window.innerWidth / 2) * 0.5;
      mouseY = (event.clientY - window.innerHeight / 2) * 0.5;
    } else {
      const rect = container.getBoundingClientRect();
      mouseX = (event.clientX - rect.left - rect.width / 2) * 0.5;
      mouseY = (event.clientY - rect.top - rect.height / 2) * 0.5;
    }
  });

  function animate() {
    requestAnimationFrame(animate);

    const positions = particleSystem.geometry.attributes.position.array;
    const linePositions = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] += velocities[i].x;
      positions[i * 3 + 1] += velocities[i].y;
      positions[i * 3 + 2] += velocities[i].z;

      if (Math.abs(positions[i * 3]) > 400) velocities[i].x *= -1;
      if (Math.abs(positions[i * 3 + 1]) > 200) velocities[i].y *= -1;
      if (Math.abs(positions[i * 3 + 2]) > 200) velocities[i].z *= -1;
    }

    for (let i = 0; i < particleCount; i++) {
      for (let j = i + 1; j < particleCount; j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const distSq = dx*dx + dy*dy + dz*dz;

        if (distSq < 13000) { // Adjusted to 13,000 for both themes
          linePositions.push(
            positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
            positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]
          );
        }
      }
    }

    lineMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    particleSystem.geometry.attributes.position.needsUpdate = true;

    camera.position.x += (mouseX - camera.position.x) * 0.02; 
    camera.position.y += (-mouseY - camera.position.y) * 0.02; 

    // FORCE Z-DISTANCE: Restricted camera Z position to a very tight, close range (Base 100)
    const targetZ = Math.max(95, Math.min(105, 100 + (mouseY * 0.002))); 
    camera.position.z += (targetZ - camera.position.z) * 0.02;

    camera.lookAt(scene.position);
    renderer.render(scene, camera);
  }
  animate();
}
(function() {
  const theme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", theme);
})();

window.addEventListener("load", hideLoader);

if (page === "landing") {
  initLanding();
  initNeuralLink();
}
if (page === "login" || page === "signup") {
  initAuth();
  initNeuralLink();
}
initTheme();
checkAuth();
initMobileMenu();
initLinkInterceptors();
initThree();
if (page === "dashboard") {
  initDashboard();
  initNeuralLink();
}
