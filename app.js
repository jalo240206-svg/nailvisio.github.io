
'use strict';

/* =========================================================
   NAILVISION — APP.JS
   Catálogo, cámara, fotografías, diseños y motor Python
   ========================================================= */

const PYTHON_API = 'http://127.0.0.1:5000/api';

const $ = (selector) => document.querySelector(selector);

const designs = [
  { id: 'natural', name: 'Nude atemporal', color: '#d9b49b', finish: 'glossy' },
  { id: 'french', name: 'Francesa clásica', color: '#f5e8dd', finish: 'glossy' },
  { id: 'wine', name: 'Vino de noche', color: '#641b35', finish: 'glossy' },
  { id: 'rose', name: 'Rosa empolvado', color: '#d88fa0', finish: 'glossy' },
  { id: 'chrome', name: 'Cromo rosado', color: '#c98fae', finish: 'chrome' },
  { id: 'lilac', name: 'Lavanda suave', color: '#b8a2d9', finish: 'glossy' },
  { id: 'red', name: 'Rojo clásico', color: '#c51636', finish: 'glossy' },
  { id: 'black', name: 'Negro elegante', color: '#17151b', finish: 'glossy' },
  { id: 'chocolate', name: 'Chocolate', color: '#70412f', finish: 'glossy' },
  { id: 'fuchsia', name: 'Fucsia intenso', color: '#e6007e', finish: 'glossy' },
  { id: 'pearl', name: 'Perla luminosa', color: '#eee6dc', finish: 'pearl' },
  { id: 'glitter', name: 'Brillo festivo', color: '#bc83cc', finish: 'glitter' },
  { id: 'floral', name: 'Floral delicado', color: '#e5a4b7', finish: 'floral' }
];

let selectedDesign = designs[0];
let selectedColor = selectedDesign.color;
let selectedFinish = selectedDesign.finish;

let photoLoaded = false;
let photoImage = null;
let cameraActive = false;
let cameraStream = null;
let landmarker = null;
let animationFrame = null;
let lastVideoTime = -1;

let referenceImage = null;
let referenceObjectUrl = null;
let currentNails = [];
let pythonAvailable = false;
let removeBackgroundEnabled = false;
let showLandmarksEnabled = false;

let cameraCanvas = null;
let cameraContext = null;
let nailCanvas = null;
let nailContext = null;

const NAIL_NAMES = [
  'Pulgar',
  'Índice',
  'Medio',
  'Anular',
  'Meñique'
];

/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  initializeCanvases();
  populateSelector();
  drawCatalog();
  setupEvents();
  updateColorLabel();
  checkPythonService();

  setCameraState(false, 'Cámara apagada');

  const intensity = $('#intensity');
  const intensityValue = $('#intensityValue');

  if (intensity && intensityValue) {
    intensityValue.textContent = `${intensity.value}%`;
  }
});

function initializeCanvases() {
  cameraCanvas = $('#nailOverlay');
  nailCanvas = $('#workCanvas');

  if (cameraCanvas) {
    cameraContext = cameraCanvas.getContext('2d');
  }

  if (nailCanvas) {
    nailContext = nailCanvas.getContext('2d');
  }
}

function setupEvents() {
  $('#enterBtn')?.addEventListener('click', () => {
    $('#splash')?.classList.add('hidden');
  });

  $('#photoInput')?.addEventListener('change', handlePhotoInput);
  $('#referenceInput')?.addEventListener('change', handleReferenceInput);

  $('#designSelect')?.addEventListener('change', (event) => {
    const design = designs.find(item => item.id === event.target.value);
    if (design) chooseDesign(design.id);
  });

  $('#colorPicker')?.addEventListener('input', (event) => {
    selectedColor = event.target.value;
    updateColorLabel();
    redrawCurrentView();
  });

  $('#finishSelect')?.addEventListener('change', (event) => {
    selectedFinish = event.target.value;
    redrawCurrentView();
  });

  $('#intensity')?.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    if ($('#intensityValue')) {
      $('#intensityValue').textContent = `${value}%`;
    }
    redrawCurrentView();
  });

  $('#removeBackground')?.addEventListener('click', () => {
    removeBackgroundEnabled = !removeBackgroundEnabled;
    $('#removeBackground')?.classList.toggle('active', removeBackgroundEnabled);
    redrawCurrentView();
  });

  $('#showLandmarks')?.addEventListener('change', (event) => {
    showLandmarksEnabled = event.target.checked;
    redrawCurrentView();
  });

  $('#startCamera')?.addEventListener('click', startCamera);
  $('#stopCamera')?.addEventListener('click', stopCamera);
  $('#capturePhoto')?.addEventListener('click', capturePhoto);

  $('#saveImage')?.addEventListener('click', saveImage);
  $('#shareImage')?.addEventListener('click', shareImage);
  $('#resetDesign')?.addEventListener('click', resetDesign);
}

/* =========================================================
   CATÁLOGO
   ========================================================= */

function populateSelector() {
  const selector = $('#designSelect');
  if (!selector) return;

  selector.innerHTML = '';

  designs.forEach((design) => {
    const option = document.createElement('option');
    option.value = design.id;
    option.textContent = design.name;
    selector.appendChild(option);
  });

  selector.value = selectedDesign.id;
}

function drawCatalog() {
  const catalog = $('#catalog');
  if (!catalog) return;

  catalog.innerHTML = '';

  designs.forEach((design) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'design-card';
    card.dataset.design = design.id;

    const swatch = document.createElement('span');
    swatch.className = 'design-swatch';
    swatch.style.backgroundColor = design.color;

    const title = document.createElement('span');
    title.className = 'design-name';
    title.textContent = design.name;

    card.append(swatch, title);

    if (design.id === selectedDesign.id) {
      card.classList.add('active');
    }

    card.addEventListener('click', () => chooseDesign(design.id));
    catalog.appendChild(card);
  });
}

function chooseDesign(id) {
  const design = designs.find(item => item.id === id);
  if (!design) return;

  selectedDesign = design;
  selectedColor = design.color;
  selectedFinish = design.finish;

  if ($('#designSelect')) $('#designSelect').value = design.id;
  if ($('#colorPicker')) $('#colorPicker').value = selectedColor;
  if ($('#finishSelect')) $('#finishSelect').value = selectedFinish;

  updateColorLabel();
  drawCatalog();
  redrawCurrentView();
}

function updateColorLabel() {
  const label = $('#colorLabel');
  if (label) label.textContent = selectedColor;
}

/* =========================================================
   SERVICIO PYTHON
   ========================================================= */

async function checkPythonService() {
  try {
    const response = await fetch(`${PYTHON_API}/health`);
    if (!response.ok) throw new Error('Servicio no disponible');

    const data = await response.json();
    pythonAvailable = Boolean(data.ok);

    console.info(
      pythonAvailable
        ? 'NailVision: motor Python conectado.'
        : 'NailVision: motor Python sin confirmar.'
    );
  } catch (error) {
    pythonAvailable = false;
    console.warn(
      'No se pudo conectar con Python. Se usará la detección disponible en el navegador.',
      error
    );
  }
}

/*
 * Envía una fotografía al servidor Python.
 * El servidor devuelve polígonos aproximados de las uñas.
 */
async function detectPhotoWithPython(image) {
  if (!image || !image.naturalWidth) {
    throw new Error('La imagen no está lista.');
  }

  const blob = await imageToBlob(image);
  const formData = new FormData();
  formData.append('image', blob, 'nailvision-photo.jpg');

  const response = await fetch(`${PYTHON_API}/detect`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Error del servidor Python: ${response.status}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'No se pudo analizar la fotografía.');
  }

  if (!data.hand_detected || !Array.isArray(data.nails)) {
    currentNails = [];
    clearNailCanvas();
    showMessage('No se detectó una mano. Intenta con otra fotografía.');
    return;
  }

  currentNails = data.nails;
  drawPythonNails(currentNails, image);
  showMessage(`${currentNails.length} uñas estimadas.`);
}

function imageToBlob(image) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo preparar la fotografía.'));
    }, 'image/jpeg', 0.92);
  });
}

/* =========================================================
   DIBUJO DE UÑAS DETECTADAS POR PYTHON
   ========================================================= */

function drawPythonNails(nails, image) {
  if (!nailCanvas || !nailContext || !image) return;

  fitCanvasToStage(nailCanvas, image);
  clearNailCanvas();

  const mapping = getSourceMapping(image, nailCanvas);
  const opacity = getIntensity() / 100;

  nails.forEach((nail, index) => {
    if (!Array.isArray(nail.polygon) || nail.polygon.length < 3) return;

    const points = nail.polygon.map(([x, y]) => ({
      x: mapping.offsetX + x * mapping.drawWidth,
      y: mapping.offsetY + y * mapping.drawHeight
    }));

    nailContext.save();
    nailContext.beginPath();
    nailContext.moveTo(points[0].x, points[0].y);

    points.slice(1).forEach(point => {
      nailContext.lineTo(point.x, point.y);
    });

    nailContext.closePath();

    // El diseño se limita al polígono estimado de cada uña.
    nailContext.globalAlpha = opacity;
    nailContext.fillStyle = selectedColor;
    nailContext.fill();

    nailContext.globalAlpha = 1;
    applyFinish(points, nailContext);

    nailContext.strokeStyle = 'rgba(255,255,255,0.7)';
    nailContext.lineWidth = 1.2;
    nailContext.stroke();

    if (showLandmarksEnabled) {
      nailContext.fillStyle = '#00d5ff';
      points.forEach(point => {
        nailContext.beginPath();
        nailContext.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
        nailContext.fill();
      });
    }

    // Detalles sencillos para diseños específicos.
    if (selectedDesign.id === 'french') {
      drawFrenchTip(points);
    } else if (selectedDesign.id === 'glitter') {
      drawGlitter(points);
    } else if (selectedDesign.id === 'floral') {
      drawFlower(points);
    }

    nailContext.restore();
  });
}

function drawFrenchTip(points) {
  if (points.length < 4) return;

  nailContext.save();
  nailContext.beginPath();
  nailContext.moveTo(points[0].x, points[0].y);
  nailContext.lineTo(points[1].x, points[1].y);
  nailContext.lineTo(points[2].x, points[2].y);
  nailContext.closePath();

  nailContext.fillStyle = '#ffffff';
  nailContext.globalAlpha = 0.9;
  nailContext.fill();
  nailContext.restore();
}

function drawGlitter(points) {
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));

  nailContext.save();
  nailContext.beginPath();
  nailContext.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(p => nailContext.lineTo(p.x, p.y));
  nailContext.closePath();
  nailContext.clip();

  nailContext.fillStyle = 'rgba(255,255,255,0.85)';

  for (let i = 0; i < 24; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    nailContext.beginPath();
    nailContext.arc(x, y, Math.random() * 1.5 + 0.4, 0, Math.PI * 2);
    nailContext.fill();
  }

  nailContext.restore();
}

function drawFlower(points) {
  const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  nailContext.save();

  for (let i = 0; i < 5; i++) {
    const angle = i * (Math.PI * 2 / 5);
    nailContext.beginPath();
    nailContext.arc(
      centerX + Math.cos(angle) * 4,
      centerY + Math.sin(angle) * 4,
      2.4,
      0,
      Math.PI * 2
    );
    nailContext.fillStyle = '#fff1f5';
    nailContext.fill();
  }

  nailContext.beginPath();
  nailContext.arc(centerX, centerY, 2, 0, Math.PI * 2);
  nailContext.fillStyle = '#f5c542';
  nailContext.fill();
  nailContext.restore();
}

function applyFinish(points, context) {
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));

  if (selectedFinish === 'chrome' || selectedFinish === 'pearl') {
    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(p => context.lineTo(p.x, p.y));
    context.closePath();
    context.clip();

    const gradient = context.createLinearGradient(minX, minY, maxX, maxY);
    gradient.addColorStop(0, 'rgba(255,255,255,0.75)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.55)');

    context.fillStyle = gradient;
    context.fill();
    context.restore();
  } else if (selectedFinish === 'glossy') {
    context.save();
    context.strokeStyle = 'rgba(255,255,255,0.42)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(minX + (maxX - minX) * 0.25, minY + 3);
    context.lineTo(minX + (maxX - minX) * 0.5, maxY - 3);
    context.stroke();
    context.restore();
  }
}

/* =========================================================
   FOTOGRAFÍAS
   ========================================================= */

async function handlePhotoInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showMessage('Selecciona un archivo de imagen.');
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    showMessage('La imagen no debe superar los 8 MB.');
    return;
  }

  stopCamera();

  const image = new Image();
  image.onload = async () => {
    photoImage = image;
    photoLoaded = true;

    const preview = $('#photoPreview');
    if (preview) {
      preview.src = image.src;
      preview.hidden = false;
    }

    if ($('#cameraVideo')) $('#cameraVideo').hidden = true;

    try {
      await detectPhoto();
    } catch (error) {
      console.error(error);
      showMessage('No se pudo detectar con Python. Comprueba que el servidor esté activo.');
    }
  };

  image.onerror = () => showMessage('No se pudo abrir la imagen seleccionada.');
  image.src = URL.createObjectURL(file);
}

async function loadPhoto(source) {
  if (!source) return;

  photoImage = source;
  photoLoaded = true;
  await detectPhoto();
}

async function detectPhoto() {
  if (!photoLoaded || !photoImage) return;

  if (pythonAvailable) {
    try {
      await detectPhotoWithPython(photoImage);
      return;
    } catch (error) {
      console.warn('Falló la detección Python:', error);
    }
  }

  showMessage(
    'El motor Python no está disponible. Inicia app.py y vuelve a cargar la foto.'
  );
}

function capturePhoto() {
  const video = $('#cameraVideo');
  if (!video || video.readyState < 2) {
    showMessage('La cámara todavía no está lista.');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const image = new Image();
  image.onload = async () => {
    photoImage = image;
    photoLoaded = true;

    const preview = $('#photoPreview');
    if (preview) {
      preview.src = image.src;
      preview.hidden = false;
    }

    stopCamera();

    try {
      await detectPhoto();
    } catch (error) {
      console.error(error);
      showMessage('No se pudo analizar la fotografía capturada.');
    }
  };

  image.src = canvas.toDataURL('image/jpeg', 0.92);
}

/* =========================================================
   CÁMARA
   ========================================================= */

async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador no permite acceder a la cámara.');
    }

    stopCamera();

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    const video = $('#cameraVideo');
    if (!video) throw new Error('No se encontró el elemento cameraVideo.');

    video.srcObject = cameraStream;
    video.hidden = false;
    await video.play();

    if ($('#photoPreview')) $('#photoPreview').hidden = true;

    cameraActive = true;
    setCameraState(true, 'Cámara activa');
    cameraLoop();
  } catch (error) {
    console.error(error);
    setCameraState(false, 'No se pudo activar la cámara');
    showMessage(error.message || 'No se pudo acceder a la cámara.');
  }
}

function stopCamera() {
  cameraActive = false;

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  const video = $('#cameraVideo');
  if (video) video.srcObject = null;

  clearCameraCanvas();
  setCameraState(false, 'Cámara apagada');
}

function cameraLoop() {
  if (!cameraActive) return;

  const video = $('#cameraVideo');

  if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    drawCameraFrame(video);
  }

  animationFrame = requestAnimationFrame(cameraLoop);
}

function drawCameraFrame(video) {
  if (!cameraCanvas || !cameraContext) return;

  fitCanvasToStage(cameraCanvas, video);
  clearCameraCanvas();

  // El backend Python procesa fotografías. La vista en directo
  // muestra la cámara, pero no ejecuta segmentación Python en tiempo real.
  if (showLandmarksEnabled) {
    cameraContext.fillStyle = '#ffffff';
    cameraContext.font = '14px sans-serif';
    cameraContext.fillText('Vista en directo', 12, 24);
  }
}

function setCameraState(active, message) {
  const status = $('#cameraStatus');
  if (status) status.textContent = message;

  $('#startCamera')?.toggleAttribute('disabled', active);
  $('#stopCamera')?.toggleAttribute('disabled', !active);
}

/* =========================================================
   IMAGEN DE REFERENCIA
   ========================================================= */

function handleReferenceInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showMessage('Selecciona una imagen de referencia.');
    return;
  }

  if (referenceObjectUrl) URL.revokeObjectURL(referenceObjectUrl);
  referenceObjectUrl = URL.createObjectURL(file);

  const image = new Image();
  image.onload = () => {
    referenceImage = image;

    const preview = $('#referencePreview');
    if (preview) {
      preview.src = image.src;
      preview.hidden = false;
    }

    showMessage(
      'Imagen de referencia cargada. Aún no se aplica automáticamente a la forma de cada uña.'
    );
  };

  image.onerror = () => showMessage('No se pudo cargar la imagen de referencia.');
  image.src = referenceObjectUrl;
}

function loadReference(file) {
  if (!file) return;
  handleReferenceInput({ target: { files: [file] } });
}

function processReferenceImage() {
  if (!referenceImage) {
    showMessage('Primero selecciona una imagen de referencia.');
    return;
  }

  showMessage(
    'La referencia está cargada. Para transferir su patrón a cada uña se necesita una función adicional de mapeo.'
  );
}

/* =========================================================
   CANVAS Y VISUALIZACIÓN
   ========================================================= */

function fitCanvasToStage(canvas, source) {
  if (!canvas || !source) return;

  const rect = canvas.parentElement?.getBoundingClientRect();
  const width = rect?.width || source.videoWidth || source.naturalWidth || 640;
  const height = rect?.height || source.videoHeight || source.naturalHeight || 480;

  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getSourceMapping(source, canvas) {
  const sourceWidth = source.naturalWidth || source.videoWidth || source.width;
  const sourceHeight = source.naturalHeight || source.videoHeight || source.height;

  const rect = canvas.parentElement?.getBoundingClientRect();
  const targetWidth = rect?.width || canvas.clientWidth || sourceWidth;
  const targetHeight = rect?.height || canvas.clientHeight || sourceHeight;

  const scale = Math.min(
    targetWidth / sourceWidth,
    targetHeight / sourceHeight
  );

  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  return {
    drawWidth,
    drawHeight,
    offsetX: (targetWidth - drawWidth) / 2,
    offsetY: (targetHeight - drawHeight) / 2
  };
}

function clearNailCanvas() {
  if (!nailCanvas || !nailContext) return;
  nailContext.clearRect(0, 0, nailCanvas.width, nailCanvas.height);
}

function clearCameraCanvas() {
  if (!cameraCanvas || !cameraContext) return;
  cameraContext.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
}

function redrawCurrentView() {
  if (photoLoaded && photoImage) {
    detectPhoto().catch(console.error);
  }
}

function getIntensity() {
  return Number($('#intensity')?.value ?? 70);
}

function drawNail() {
  redrawCurrentView();
}

function drawDecoration() {
  redrawCurrentView();
}

function drawResults() {
  redrawCurrentView();
}

/* =========================================================
   GUARDAR Y COMPARTIR
   ========================================================= */

function composeExportCanvas() {
  if (!photoImage || !photoLoaded) {
    showMessage('Primero carga una fotografía.');
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = photoImage.naturalWidth;
  canvas.height = photoImage.naturalHeight;

  const context = canvas.getContext('2d');
  context.drawImage(photoImage, 0, 0);

  // Redibuja las formas estimadas sobre las dimensiones originales.
  currentNails.forEach((nail) => {
    if (!Array.isArray(nail.polygon) || nail.polygon.length < 3) return;

    context.save();
    context.beginPath();

    nail.polygon.forEach(([x, y], index) => {
      const px = x * canvas.width;
      const py = y * canvas.height;

      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });

    context.closePath();
    context.globalAlpha = getIntensity() / 100;
    context.fillStyle = selectedColor;
    context.fill();

    context.globalAlpha = 1;
    context.strokeStyle = 'rgba(255,255,255,0.65)';
    context.lineWidth = Math.max(1, canvas.width / 800);
    context.stroke();
    context.restore();
  });

  return canvas;
}

function saveImage() {
  const canvas = composeExportCanvas();
  if (!canvas) return;

  canvas.toBlob((blob) => {
    if (!blob) {
      showMessage('No se pudo generar la imagen.');
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'NailVision-diseno.png';
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showMessage('Imagen preparada para guardar.');
  }, 'image/png');
}

async function shareImage() {
  const canvas = composeExportCanvas();
  if (!canvas) return;

  canvas.toBlob(async (blob) => {
    if (!blob) {
      showMessage('No se pudo generar la imagen para compartir.');
      return;
    }

    const file = new File([blob], 'NailVision-diseno.png', {
      type: 'image/png'
    });

    try {
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          title: 'Mi diseño NailVision',
          text: 'Mira este diseño de uñas.',
          files: [file]
        });
      } else {
        saveImage();
        showMessage(
          'Tu navegador no permite compartir el archivo directamente. Se descargará para que puedas enviarlo por WhatsApp.'
        );
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(error);
        showMessage('No se pudo abrir la opción de compartir.');
      }
    }
  }, 'image/png');
}

/* =========================================================
   RESTABLECER Y MENSAJES
   ========================================================= */

function resetDesign() {
  selectedDesign = designs[0];
  selectedColor = selectedDesign.color;
  selectedFinish = selectedDesign.finish;

  if ($('#colorPicker')) $('#colorPicker').value = selectedColor;
  if ($('#finishSelect')) $('#finishSelect').value = selectedFinish;
  if ($('#designSelect')) $('#designSelect').value = selectedDesign.id;
  if ($('#intensity')) $('#intensity').value = 70;
  if ($('#intensityValue')) $('#intensityValue').textContent = '70%';

  updateColorLabel();
  drawCatalog();
  redrawCurrentView();
}

function showMessage(message) {
  const status =
    $('#statusMessage') ||
    $('#cameraStatus') ||
    $('#message');

  if (status) status.textContent = message;
  else console.info(`[NailVision] ${message}`);
}

/* =========================================================
   COMPATIBILIDAD
   ========================================================= */

window.NailVision = {
  startCamera,
  stopCamera,
  capturePhoto,
  loadPhoto,
  detectPhoto,
  detectPhotoWithPython,
  loadReference,
  processReferenceImage,
  drawNail,
  drawDecoration,
  drawResults,
  saveImage,
  shareImage,
  resetDesign,
  chooseDesign,
  checkPythonService
};
