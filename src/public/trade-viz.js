class TradeViz {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext("2d");
    this._particles = [];
    this._whaleLabels = [];
    this._flashAlpha = 0;
    this._flashColor = null;
    this._priceTracker = new PriceTracker();
    this._imbalanceTracker = null;
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas.parentElement);
    this._resize();
    this._animate();
  }

  setImbalanceTracker(tracker) {
    this._imbalanceTracker = tracker;
  }

  addTrade(trade) {
    this._priceTracker.add(trade.price);
    const range = this._priceTracker.range();
    if (!range) return;

    const priceT = (trade.price - range.min) / (range.max - range.min);
    const margin = 40;
    const y = margin + (1 - priceT) * (this._h - margin * 2);

    const cx = this._w / 2;
    const spread = (this._w / 2 - margin) * 0.8;
    const jitter = (Math.random() - 0.5) * spread * 0.4;
    const x = trade.isSell ? cx - spread * 0.5 + jitter : cx + spread * 0.5 + jitter;

    const r = Math.max(3, Math.min(40, 4 + Math.log(1 + trade.quantity * 100) * 4));

    this._particles.push({
      x,
      y,
      r,
      maxR: r,
      isSell: trade.isSell,
      alpha: 1,
      age: 0,
      lifetime: 1.5,
      isWhale: false,
    });
  }

  addWhaleAlert(trade) {
    this._priceTracker.add(trade.price);
    const range = this._priceTracker.range();
    if (!range) return;

    const priceT = (trade.price - range.min) / (range.max - range.min);
    const margin = 40;
    const y = margin + (1 - priceT) * (this._h - margin * 2);

    const cx = this._w / 2;
    const spread = (this._w / 2 - margin) * 0.8;
    const x = trade.isSell ? cx - spread * 0.5 : cx + spread * 0.5;

    const tier = trade._whaleTier || 1;
    const r = tier === 2 ? 50 : 30;

    this._particles.push({
      x,
      y,
      r,
      maxR: r,
      isSell: trade.isSell,
      alpha: 1,
      age: 0,
      lifetime: tier === 2 ? 4 : 2.5,
      isWhale: true,
      whaleTier: tier,
      ringPhase: 0,
    });

    if (tier === 2) {
      this._flashAlpha = 0.3;
      this._flashColor = trade.isSell ? [220, 50, 50] : [50, 200, 80];

      this._whaleLabels.push({
        x: this._w / 2,
        y: y,
        text: `${trade.quantity.toFixed(2)} BTC`,
        isSell: trade.isSell,
        alpha: 1,
        age: 0,
        lifetime: 3,
      });
    }
  }

  _resize() {
    const parent = this._canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = parent.clientWidth * dpr;
    this._canvas.height = parent.clientHeight * dpr;
    this._canvas.style.width = parent.clientWidth + "px";
    this._canvas.style.height = parent.clientHeight + "px";
    this._ctx.scale(dpr, dpr);
    this._w = parent.clientWidth;
    this._h = parent.clientHeight;
  }

  _animate() {
    const dt = 1 / 60;
    const ctx = this._ctx;

    ctx.clearRect(0, 0, this._w, this._h);

    // screen flash for tier 2 whales
    if (this._flashAlpha > 0) {
      const c = this._flashColor;
      ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${this._flashAlpha})`;
      ctx.fillRect(0, 0, this._w, this._h);
      this._flashAlpha = Math.max(0, this._flashAlpha - dt * 0.5);
    }

    // center divider
    ctx.strokeStyle = "rgba(40, 40, 60, 0.5)";
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(this._w / 2, 0);
    ctx.lineTo(this._w / 2, this._h);
    ctx.stroke();
    ctx.setLineDash([]);

    // sell/buy labels
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(60, 60, 80, 0.6)";
    ctx.textAlign = "center";
    ctx.fillText("SELL", this._w * 0.25, 16);
    ctx.fillText("BUY", this._w * 0.75, 16);

    // particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.age += dt;
      p.alpha = Math.max(0, 1 - p.age / p.lifetime);
      p.r = p.maxR * (0.6 + 0.4 * (1 - p.age / p.lifetime));

      if (p.alpha <= 0) {
        this._particles.splice(i, 1);
        continue;
      }

      const color = p.isSell ? [220, 50, 50] : [50, 200, 80];

      if (p.isWhale) {
        p.ringPhase += dt * 3;
        const ringPulse = 1 + Math.sin(p.ringPhase) * 0.2;

        // glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${p.alpha * 0.1})`;
        ctx.fill();

        // pulsing ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * ringPulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${p.alpha * 0.7})`;
        ctx.lineWidth = p.whaleTier === 2 ? 3 : 2;
        ctx.stroke();

        // core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${p.alpha * 0.8})`;
        ctx.fill();

        // tier 2: horizontal flash line
        if (p.whaleTier === 2 && p.age < 0.5) {
          const lineAlpha = (1 - p.age / 0.5) * 0.4;
          ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${lineAlpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, p.y);
          ctx.lineTo(this._w, p.y);
          ctx.stroke();
        }
      } else {
        // normal particle (unchanged)
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${p.alpha * 0.08})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${p.alpha * 0.6})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${p.alpha * 0.9})`;
        ctx.fill();
      }
    }

    // whale labels
    for (let i = this._whaleLabels.length - 1; i >= 0; i--) {
      const lbl = this._whaleLabels[i];
      lbl.age += dt;
      lbl.alpha = Math.max(0, 1 - lbl.age / lbl.lifetime);

      if (lbl.alpha <= 0) {
        this._whaleLabels.splice(i, 1);
        continue;
      }

      const color = lbl.isSell ? "220, 50, 50" : "50, 200, 80";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(${color}, ${lbl.alpha})`;
      ctx.fillText(lbl.text, lbl.x, lbl.y - 30 - lbl.age * 10);
    }

    // CVD line
    this._drawCVD(ctx);

    // cap particle count
    if (this._particles.length > 500) {
      this._particles.splice(0, this._particles.length - 500);
    }

    requestAnimationFrame(() => this._animate());
  }

  _drawCVD(ctx) {
    if (!this._imbalanceTracker) return;
    const points = this._imbalanceTracker.cvdPoints;
    if (points.length < 2) return;

    const now = Date.now();
    const margin = 40;
    const cvdAreaTop = this._h - 80;
    const cvdAreaBottom = this._h - 10;
    const cvdH = cvdAreaBottom - cvdAreaTop;

    let minCvd = Infinity;
    let maxCvd = -Infinity;
    for (const p of points) {
      if (p.cvd < minCvd) minCvd = p.cvd;
      if (p.cvd > maxCvd) maxCvd = p.cvd;
    }
    if (minCvd === maxCvd) {
      minCvd -= 0.01;
      maxCvd += 0.01;
    }

    const oldest = points[0].time;
    const timeSpan = now - oldest || 1;

    // zero line
    const zeroY = cvdAreaTop + (1 - (0 - minCvd) / (maxCvd - minCvd)) * cvdH;
    if (zeroY >= cvdAreaTop && zeroY <= cvdAreaBottom) {
      ctx.strokeStyle = "rgba(80, 80, 100, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(margin, zeroY);
      ctx.lineTo(this._w - margin, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // CVD line
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let prevAboveZero = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = margin + ((p.time - oldest) / timeSpan) * (this._w - margin * 2);
      const y = cvdAreaTop + (1 - (p.cvd - minCvd) / (maxCvd - minCvd)) * cvdH;
      const aboveZero = p.cvd >= 0;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      if (prevAboveZero !== null && prevAboveZero !== aboveZero) {
        ctx.strokeStyle = prevAboveZero ? "rgba(50, 200, 80, 0.6)" : "rgba(220, 50, 50, 0.6)";
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
      prevAboveZero = aboveZero;
    }
    ctx.strokeStyle = prevAboveZero ? "rgba(50, 200, 80, 0.6)" : "rgba(220, 50, 50, 0.6)";
    ctx.stroke();

    // CVD label
    ctx.font = "9px monospace";
    ctx.fillStyle = "rgba(60, 60, 80, 0.6)";
    ctx.textAlign = "left";
    ctx.fillText("CVD", margin, cvdAreaTop - 4);
  }
}
