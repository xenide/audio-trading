class TradeViz {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext("2d");
    this._particles = [];
    this._priceTracker = new PriceTracker();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas.parentElement);
    this._resize();
    this._animate();
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

  addTrade(trade) {
    this._priceTracker.add(trade.price);
    const range = this._priceTracker.range();
    if (!range) return;

    // vertical position: price within recent range (inverted so high price = top)
    const priceT = (trade.price - range.min) / (range.max - range.min);
    const margin = 40;
    const y = margin + (1 - priceT) * (this._h - margin * 2);

    // horizontal: buys right of center, sells left
    const cx = this._w / 2;
    const spread = (this._w / 2 - margin) * 0.8;
    const jitter = (Math.random() - 0.5) * spread * 0.4;
    const x = trade.isSell ? cx - spread * 0.5 + jitter : cx + spread * 0.5 + jitter;

    // radius: log-scaled by quantity
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
    });
  }

  _animate() {
    const dt = 1 / 60;
    const ctx = this._ctx;

    ctx.clearRect(0, 0, this._w, this._h);

    // draw center divider
    ctx.strokeStyle = "rgba(40, 40, 60, 0.5)";
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(this._w / 2, 0);
    ctx.lineTo(this._w / 2, this._h);
    ctx.stroke();
    ctx.setLineDash([]);

    // draw sell/buy labels
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(60, 60, 80, 0.6)";
    ctx.textAlign = "center";
    ctx.fillText("SELL", this._w * 0.25, 16);
    ctx.fillText("BUY", this._w * 0.75, 16);

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

      // glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${p.alpha * 0.08})`;
      ctx.fill();

      // core circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${p.alpha * 0.6})`;
      ctx.fill();

      // bright center
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${p.alpha * 0.9})`;
      ctx.fill();
    }

    // cap particle count to prevent memory buildup
    if (this._particles.length > 500) {
      this._particles.splice(0, this._particles.length - 500);
    }

    requestAnimationFrame(() => this._animate());
  }
}
