import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Table, TableStatus } from '../types';

interface CanvasMapProps {
  tables: Table[];
  onTableClick: (tableId: string) => void;
}

const CanvasMap: React.FC<CanvasMapProps> = ({ tables, onTableClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 50, y: 50 }); 
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);

  // Constants for drawing
  const TABLE_WIDTH = 45;
  const TABLE_HEIGHT = 25;
  const GAP = 15;

  const drawCheckmark = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.2, y + size * 0.5);
    ctx.lineTo(x + size * 0.45, y + size * 0.8);
    ctx.lineTo(x + size * 0.8, y + size * 0.2);
    ctx.strokeStyle = '#15803d'; 
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const drawExclamation = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size * 0.8, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + size * 0.4, y + size * 0.15, size * 0.2, size * 0.5, 2);
    ctx.fill();
  };

  const draw = useCallback((exportMode = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // For export, allow solid background
    if (exportMode) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw grid
    const gridSize = 50 * scale;
    ctx.strokeStyle = exportMode ? '#e2e8f0' : 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (offset.x % gridSize); x < canvas.width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = (offset.y % gridSize); y < canvas.height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    tables.forEach((table) => {
      const drawX = table.x * (TABLE_WIDTH + GAP);
      const drawY = table.y * (TABLE_HEIGHT + GAP);

      let fillColor = '#ffffff';
      let strokeColor = '#94a3b8';
      let shadowColor = 'rgba(0,0,0,0.05)';

      if (table.status === TableStatus.Completed) {
        fillColor = '#dcfce7'; 
        strokeColor = '#22c55e';
        shadowColor = 'rgba(34, 197, 94, 0.2)';
      } else if (table.status === TableStatus.Issue) {
        fillColor = '#fee2e2'; 
        strokeColor = '#ef4444'; 
        shadowColor = 'rgba(239, 68, 68, 0.2)';
      }

      // Shadow
      ctx.fillStyle = shadowColor;
      ctx.fillRect(drawX + 3, drawY + 3, TABLE_WIDTH, TABLE_HEIGHT);

      // Main Rect
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = table.status === TableStatus.Pending ? 1 : 2;
      
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(drawX, drawY, TABLE_WIDTH, TABLE_HEIGHT, 4);
      } else {
        ctx.rect(drawX, drawY, TABLE_WIDTH, TABLE_HEIGHT);
      }
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(table.type, drawX + 4, drawY + 4);

      // Icon
      if (table.status === TableStatus.Completed) {
        drawCheckmark(ctx, drawX + TABLE_WIDTH - 16, drawY + TABLE_HEIGHT - 16, 14);
      } else if (table.status === TableStatus.Issue) {
        drawExclamation(ctx, drawX + TABLE_WIDTH - 16, drawY + TABLE_HEIGHT - 16, 14);
      } else {
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(drawX + TABLE_WIDTH - 8, drawY + TABLE_HEIGHT - 8, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    ctx.restore();
  }, [tables, scale, offset]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse Events
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.min(Math.max(scale + delta, 0.2), 5);
    setScale(newScale);
  };

  // Touch Events (Pinch to Zoom)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
        setIsDragging(true);
        setDragStart({ x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y });
    } else if (e.touches.length === 2) {
        setIsDragging(false); // Stop dragging when pinching
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        setLastTouchDistance(dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
        setOffset({
            x: e.touches[0].clientX - dragStart.x,
            y: e.touches[0].clientY - dragStart.y,
        });
    } else if (e.touches.length === 2 && lastTouchDistance) {
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        
        const delta = dist - lastTouchDistance;
        // Sensitivity factor for pinch
        const zoomFactor = delta * 0.005; 
        const newScale = Math.min(Math.max(scale + zoomFactor, 0.2), 5);
        
        setScale(newScale);
        setLastTouchDistance(dist);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setLastTouchDistance(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return; 

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - offset.x) / scale;
    const clickY = (e.clientY - rect.top - offset.y) / scale;

    const clickedTable = tables.find(t => {
      const tx = t.x * (TABLE_WIDTH + GAP);
      const ty = t.y * (TABLE_HEIGHT + GAP);
      return (
        clickX >= tx &&
        clickX <= tx + TABLE_WIDTH &&
        clickY >= ty &&
        clickY <= ty + TABLE_HEIGHT
      );
    });

    if (clickedTable) {
      onTableClick(clickedTable.id);
    }
  };

  const resetView = () => {
      setScale(1);
      setOffset({x: 50, y: 50});
  };

  const handleDownload = () => {
      if(canvasRef.current) {
          // Re-draw with solid background for export
          draw(true);
          const link = document.createElement('a');
          link.download = `solar-park-plan-${Date.now()}.png`;
          link.href = canvasRef.current.toDataURL();
          link.click();
          // Draw back normal state
          setTimeout(() => draw(false), 100);
      }
  };

  return (
    <div className="relative w-full h-96 select-none bg-white/40 backdrop-blur-xl">
      
      {/* Zoom Controls - Glass Pills */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <button 
            className="w-10 h-10 flex items-center justify-center bg-white/70 backdrop-blur-md rounded-full shadow-lg border border-white/40 text-slate-700 hover:bg-white transition"
            onClick={() => setScale(s => Math.min(s + 0.2, 5))}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button 
            className="w-10 h-10 flex items-center justify-center bg-white/70 backdrop-blur-md rounded-full shadow-lg border border-white/40 text-slate-700 hover:bg-white transition"
            onClick={() => setScale(s => Math.max(s - 0.2, 0.2))}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button 
            className="w-10 h-10 flex items-center justify-center bg-white/70 backdrop-blur-md rounded-full shadow-lg border border-white/40 text-slate-700 hover:bg-white transition mt-2"
            onClick={handleDownload}
            title="Uložit jako obrázek"
        >
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
        <button 
            className="w-10 h-10 flex items-center justify-center bg-white/70 backdrop-blur-md rounded-full shadow-lg border border-white/40 text-slate-700 hover:bg-white transition"
            onClick={resetView}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/></svg>
        </button>
      </div>

      <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono text-white shadow-lg pointer-events-none">
          Zoom: {Math.round(scale * 100)}%
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="cursor-move w-full h-full touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
};

export default CanvasMap;