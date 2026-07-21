'use strict';

const clamp = (number, minimum, maximum) => (
  Math.max(minimum, Math.min(maximum, number))
);

function computeLayout(width, height, reducedMotion = false) {
  const mobile = width <= 680;
  const roofWidth = mobile
    ? width * 0.94
    : Math.min(width * 0.72, 980);
  return {
    width,
    height,
    mobile,
    reducedMotion,
    roofY: Math.max(150, height * 0.26),
    roofWidth,
    centerX: width * 0.5,
    strandCount: mobile ? 24 : Math.round(clamp(width / 30, 34, 42)),
    pointerRadius: mobile ? 64 : 52,
    impulse: reducedMotion ? 0.18 : 0.48,
  };
}

function createStrand(anchorX, anchorY, glyphs, spacing) {
  const nodes = [{
    x: anchorX,
    y: anchorY,
    px: anchorX,
    py: anchorY,
    fixed: true,
    glyph: '',
  }];

  glyphs.forEach((glyph, index) => {
    const y = anchorY + spacing * (index + 1);
    nodes.push({
      x: anchorX,
      y,
      px: anchorX,
      py: y,
      fixed: false,
      glyph,
    });
  });

  return { anchorX, anchorY, spacing, nodes };
}

function applyPointerImpulse(strand, pointer, radius, strength) {
  for (let index = 1; index < strand.nodes.length; index += 1) {
    const node = strand.nodes[index];
    const dx = node.x - pointer.x;
    const dy = node.y - pointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= radius) continue;

    const falloff = (1 - distance / radius) ** 2;
    node.px -= clamp(pointer.vx, -42, 42) * strength * falloff;
    node.py -= clamp(pointer.vy, -28, 28) * strength * 0.35 * falloff;
  }
}

function stepStrand(
  strand,
  {
    gravity = 0.2,
    damping = 0.966,
    iterations = 5,
    maxSpeed = 16,
  } = {},
) {
  for (let index = 1; index < strand.nodes.length; index += 1) {
    const node = strand.nodes[index];
    const velocityX = clamp((node.x - node.px) * damping, -maxSpeed, maxSpeed);
    const velocityY = clamp((node.y - node.py) * damping, -maxSpeed, maxSpeed);
    node.px = node.x;
    node.py = node.y;
    node.x += velocityX;
    node.y += velocityY + gravity;
  }

  for (let pass = 0; pass < iterations; pass += 1) {
    const root = strand.nodes[0];
    root.x = strand.anchorX;
    root.px = strand.anchorX;
    root.y = strand.anchorY;
    root.py = strand.anchorY;

    for (let index = 1; index < strand.nodes.length; index += 1) {
      const previous = strand.nodes[index - 1];
      const node = strand.nodes[index];
      const dx = node.x - previous.x;
      const dy = node.y - previous.y;
      const distance = Math.hypot(dx, dy) || 1;
      const correction = (distance - strand.spacing) / distance;

      if (previous.fixed) {
        node.x -= dx * correction;
        node.y -= dy * correction;
      } else {
        const half = correction * 0.5;
        previous.x += dx * half;
        previous.y += dy * half;
        node.x -= dx * half;
        node.y -= dy * half;
      }
    }
  }
}

const CHINESE = [
  '山色入檐低',
  '疏雨滴梧桐',
  '风来翻旧页',
  '月照一庭松',
  '檐铃隔夜语',
  '云从窗外生',
  '庭深人未眠',
  '竹影落空阶',
  '远岫含烟薄',
  '一帘文字垂',
];

const ENGLISH = [
  'words fall softly',
  'under the eaves',
  'gravity remembers',
  'a quiet current',
];

function hash(number) {
  const value = Math.sin(number * 91.733) * 43758.5453;
  return value - Math.floor(value);
}

function eaveY(x, layout) {
  const normal = (x - layout.centerX) / (layout.roofWidth * 0.5);
  return layout.roofY - 27 * Math.abs(normal) ** 3;
}

function buildStrands(layout) {
  const curtainWidth = layout.roofWidth * (layout.mobile ? 0.77 : 0.7);
  const left = layout.centerX - curtainWidth * 0.5;
  const step = curtainWidth / (layout.strandCount - 1);

  return Array.from({ length: layout.strandCount }, (_, index) => {
    const anchorX = left + index * step;
    const anchorY = eaveY(anchorX, layout) + 5 + hash(index + 3) * 4;
    const spacing = (layout.mobile ? 17 : 18.3) + hash(index + 11) * 1.9;
    const desiredLength = 13 + Math.floor(hash(index + 19) * 12);
    const availableLength = Math.max(8, Math.floor((layout.height - anchorY - 34) / spacing));
    const length = Math.min(desiredLength, availableLength);
    const source = index % 7 === 3
      ? ENGLISH[index % ENGLISH.length]
      : `${CHINESE[index % CHINESE.length]}${CHINESE[(index * 3 + 2) % CHINESE.length]}`;
    const sourceGlyphs = Array.from(source);
    const glyphs = Array.from(
      { length },
      (_, glyphIndex) => sourceGlyphs[glyphIndex % sourceGlyphs.length],
    );
    const strand = createStrand(anchorX, anchorY, glyphs, spacing);
    strand.alpha = 0.44 + hash(index + 37) * 0.34;
    strand.fontSize = (layout.mobile ? 10.5 : 11.2) + hash(index + 41) * 1.6;
    strand.english = index % 7 === 3;
    return strand;
  });
}

function roofPoint(position, layout) {
  const normal = position * 2 - 1;
  return {
    x: layout.centerX + normal * layout.roofWidth * 0.5,
    y: layout.roofY - 27 * Math.abs(normal) ** 3,
  };
}

function drawRoof(ctx, layout) {
  const { centerX: cx, roofY: y, roofWidth: width } = layout;
  const left = cx - width * 0.5;
  const right = cx + width * 0.5;
  const gradient = ctx.createLinearGradient(0, y - 106, 0, y + 12);
  gradient.addColorStop(0, '#d7a53a');
  gradient.addColorStop(0.48, '#c48c28');
  gradient.addColorStop(1, '#8f5a18');

  ctx.save();
  ctx.shadowColor = 'rgba(54, 37, 17, 0.28)';
  ctx.shadowBlur = layout.mobile ? 16 : 25;
  ctx.shadowOffsetY = 15;
  ctx.beginPath();
  ctx.moveTo(left - 32, y - 28);
  ctx.quadraticCurveTo(cx, y + 17, right + 32, y - 28);
  ctx.quadraticCurveTo(right - 5, y - 48, right - 62, y - 59);
  ctx.quadraticCurveTo(cx, y - 112, left + 62, y - 59);
  ctx.quadraticCurveTo(left + 5, y - 48, left - 32, y - 28);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left - 32, y - 28);
  ctx.quadraticCurveTo(cx, y + 17, right + 32, y - 28);
  ctx.lineWidth = layout.mobile ? 8 : 10;
  ctx.strokeStyle = '#50261c';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(left - 28, y - 32);
  ctx.quadraticCurveTo(cx, y + 9, right + 28, y - 32);
  ctx.lineWidth = layout.mobile ? 4 : 5;
  ctx.strokeStyle = '#9e3020';
  ctx.stroke();

  const tileCount = layout.mobile ? 26 : 40;
  for (let index = 0; index <= tileCount; index += 1) {
    const position = index / tileCount;
    const normal = position * 2 - 1;
    const end = roofPoint(position, layout);
    const startX = cx + normal * width * 0.37;
    const startY = y - 91 + 29 * normal * normal;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(
      cx + normal * width * 0.43,
      (startY + end.y) * 0.5 - 3,
      end.x,
      end.y,
    );
    ctx.strokeStyle = index % 2 === 0
      ? 'rgba(255, 216, 96, 0.77)'
      : 'rgba(103, 57, 14, 0.44)';
    ctx.lineWidth = index % 2 === 0 ? 1.15 : 0.75;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(cx - width * 0.28, y - 87);
  ctx.quadraticCurveTo(cx, y - 107, cx + width * 0.28, y - 87);
  ctx.lineCap = 'round';
  ctx.lineWidth = layout.mobile ? 7 : 9;
  ctx.strokeStyle = '#4a281c';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.28, y - 90);
  ctx.quadraticCurveTo(cx, y - 109, cx + width * 0.28, y - 90);
  ctx.lineWidth = layout.mobile ? 3 : 4;
  ctx.strokeStyle = '#be852a';
  ctx.stroke();

  const capCount = layout.mobile ? 24 : 36;
  for (let index = 0; index <= capCount; index += 1) {
    const point = roofPoint(index / capCount, layout);
    ctx.beginPath();
    ctx.arc(point.x, point.y + 1, layout.mobile ? 2.1 : 2.6, 0, Math.PI * 2);
    ctx.fillStyle = index % 2 ? '#7f421c' : '#c68d2e';
    ctx.fill();
  }

  ctx.fillStyle = '#4e241a';
  ctx.fillRect(cx - width * 0.39, y + 1, width * 0.78, layout.mobile ? 7 : 9);
  ctx.fillStyle = '#9b3423';
  ctx.fillRect(cx - width * 0.36, y + 2, width * 0.72, layout.mobile ? 4 : 5);

  if (!layout.mobile) {
    for (let index = 0; index < 11; index += 1) {
      const x = cx - width * 0.31 + (width * 0.62 * index) / 10;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 9);
      ctx.lineTo(x, y + 18);
      ctx.lineTo(x + 8, y + 9);
      ctx.strokeStyle = index % 2 ? '#6a2b20' : '#a54129';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  const finial = (x, direction) => {
    ctx.save();
    ctx.translate(x, y - 37);
    ctx.scale(direction, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(18, -11, 25, -26);
    ctx.quadraticCurveTo(29, -36, 37, -31);
    ctx.strokeStyle = '#7a481d';
    ctx.lineWidth = layout.mobile ? 3 : 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  };
  finial(left - 20, -1);
  finial(right + 20, 1);
  ctx.restore();
}

function getGlyphSprite(
  cache,
  glyph,
  fontSize,
  english,
  canvasFactory = () => document.createElement('canvas'),
) {
  const roundedSize = Math.round(fontSize * 2) / 2;
  const key = `${english ? 'en' : 'zh'}:${roundedSize}:${glyph}`;
  if (cache.has(key)) return cache.get(key);

  const pixelScale = 2;
  const padding = Math.ceil(roundedSize * 0.7);
  const cssSize = Math.ceil(roundedSize + padding * 2);
  const spriteCanvas = canvasFactory();
  spriteCanvas.width = cssSize * pixelScale;
  spriteCanvas.height = cssSize * pixelScale;
  const spriteContext = spriteCanvas.getContext('2d');
  spriteContext.scale(pixelScale, pixelScale);
  spriteContext.textAlign = 'center';
  spriteContext.textBaseline = 'middle';
  spriteContext.font = english
    ? `${roundedSize}px Georgia, serif`
    : `${roundedSize}px "Songti SC", "STSong", serif`;
  spriteContext.fillStyle = english ? '#5d462a' : '#2d251c';
  spriteContext.fillText(glyph, cssSize * 0.5, cssSize * 0.5);

  const sprite = { canvas: spriteCanvas, cssSize };
  cache.set(key, sprite);
  return sprite;
}

function drawStrands(ctx, strands, glyphCache) {
  ctx.save();

  for (const strand of strands) {
    ctx.beginPath();
    ctx.moveTo(strand.nodes[0].x, strand.nodes[0].y);
    for (let index = 1; index < strand.nodes.length; index += 1) {
      const node = strand.nodes[index];
      ctx.lineTo(node.x, node.y);
    }
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = `rgba(65, 49, 31, ${strand.alpha * 0.28})`;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(strand.anchorX, strand.anchorY, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(105, 54, 27, 0.7)';
    ctx.fill();

    for (let index = 1; index < strand.nodes.length; index += 1) {
      const node = strand.nodes[index];
      const before = strand.nodes[index - 1];
      const after = strand.nodes[Math.min(index + 1, strand.nodes.length - 1)];
      const angle = Math.atan2(after.y - before.y, after.x - before.x) - Math.PI * 0.5;
      const fontSize = strand.english
        ? Math.max(8.5, strand.fontSize - 1.8)
        : strand.fontSize;
      const sprite = node.glyph === ' '
        ? null
        : getGlyphSprite(glyphCache, node.glyph, fontSize, strand.english);
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.rotate(angle * 0.72);
      ctx.globalAlpha = strand.english ? strand.alpha * 0.82 : strand.alpha;
      if (sprite) {
        ctx.drawImage(
          sprite.canvas,
          -sprite.cssSize * 0.5,
          -sprite.cssSize * 0.5,
          sprite.cssSize,
          sprite.cssSize,
        );
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

function getPhysicsConfig(reducedMotion) {
  return reducedMotion
    ? { gravity: 0.12, damping: 0.94, iterations: 5, maxSpeed: 8 }
    : { gravity: 0.22, damping: 0.95, iterations: 5, maxSpeed: 16 };
}

function getSimulationSteps(elapsedMilliseconds) {
  return clamp(Math.round(elapsedMilliseconds / 16.7), 1, 6);
}

function boot() {
  const canvas = document.getElementById('scene');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const artwork = document.querySelector('.artwork');
  const ring = document.querySelector('.cursor-ring');
  const soundButton = document.querySelector('.sound-toggle');
  const soundLabel = soundButton.querySelector('[data-sound-label]');
  let hasAttemptedAutoStart = false;
  const updateSoundButton = (playing) => {
    soundButton.setAttribute('aria-pressed', String(playing));
    soundButton.setAttribute('aria-label', playing ? '静音环境声音' : '开启环境声音');
    soundLabel.textContent = playing ? '静音' : '声音 开';
  };
  const soundscape = typeof window.createAmbientSoundscape === 'function'
    ? window.createAmbientSoundscape({ onStateChange: updateSoundButton })
    : null;
  if (soundscape) {
    soundButton.hidden = false;
    updateSoundButton(false);
    soundButton.addEventListener('click', async () => {
      hasAttemptedAutoStart = true;
      await soundscape.toggle();
    });
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const physicsConfig = getPhysicsConfig(reducedMotion);
  const glyphCache = new Map();
  let layout;
  let strands;
  let resizeFrame = 0;
  let lastFrameTime = window.performance.now();
  const pointer = {
    x: -999,
    y: -999,
    vx: 0,
    vy: 0,
    active: false,
    lastTime: 0,
  };

  const resize = () => {
    const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
    layout = computeLayout(window.innerWidth, window.innerHeight, reducedMotion);
    canvas.width = Math.round(layout.width * deviceScale);
    canvas.height = Math.round(layout.height * deviceScale);
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    strands = buildStrands(layout);
    glyphCache.clear();
    for (const strand of strands) {
      const fontSize = strand.english
        ? Math.max(8.5, strand.fontSize - 1.8)
        : strand.fontSize;
      for (const node of strand.nodes) {
        if (node.glyph !== '') {
          getGlyphSprite(glyphCache, node.glyph, fontSize, strand.english);
        }
      }
    }
  };

  const scheduleResize = () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(resize);
  };

  const movePointer = (event) => {
    const now = window.performance.now();
    if (pointer.lastTime > 0) {
      const frameRatio = 16 / Math.max(8, now - pointer.lastTime);
      pointer.vx = (event.clientX - pointer.x) * frameRatio;
      pointer.vy = (event.clientY - pointer.y) * frameRatio;
    } else {
      pointer.vx = 0;
      pointer.vy = 0;
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.lastTime = now;
    pointer.active = true;
    artwork.classList.add('is-pointing');
    ring.style.left = `${pointer.x}px`;
    ring.style.top = `${pointer.y}px`;
  };

  const endPointer = () => {
    pointer.active = false;
    pointer.vx = 0;
    pointer.vy = 0;
    pointer.lastTime = 0;
    artwork.classList.remove('is-pointing');
  };

  const frame = (time) => {
    const simulationSteps = getSimulationSteps(time - lastFrameTime);
    lastFrameTime = time;
    ctx.clearRect(0, 0, layout.width, layout.height);
    drawRoof(ctx, layout);

    for (const strand of strands) {
      if (pointer.active) {
        applyPointerImpulse(
          strand,
          pointer,
          layout.pointerRadius,
          layout.impulse,
        );
      }
      for (let step = 0; step < simulationSteps; step += 1) {
        stepStrand(strand, physicsConfig);
      }
    }

    drawStrands(ctx, strands, glyphCache);
    pointer.vx *= 0.68;
    pointer.vy *= 0.68;
    window.requestAnimationFrame(frame);
  };

  const beginPointer = (event) => {
    movePointer(event);
    if (soundscape && !hasAttemptedAutoStart) {
      hasAttemptedAutoStart = true;
      soundscape.start();
    }
  };

  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerdown', beginPointer);
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', endPointer);
  window.addEventListener('blur', endPointer);
  window.addEventListener('resize', scheduleResize, { passive: true });

  resize();
  window.requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') boot();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeLayout,
    createStrand,
    applyPointerImpulse,
    stepStrand,
    buildStrands,
    getPhysicsConfig,
    getSimulationSteps,
    getGlyphSprite,
  };
}
