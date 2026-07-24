'use client'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { saveChart } from '../lib/appStore'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, LabelList, ReferenceLine,
  Cell, PieChart as RPieChart, Pie, RadarChart as RRadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart,
  FunnelChart as RFunnelChart, Funnel,
} from 'recharts'

// ── Palette & Helpers ─────────────────────────────────────────────────────────
const PALETTE = ['#1f6feb','#3fb950','#ff9900','#f85149','#d2a8ff','#ffa657','#79c0ff','#56d364','#e3b341','#58a6ff']
const EXCEL_COLORFUL_THEMES = [
  ['#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47'],
  ['#5B9BD5', '#A5A5A5', '#4472C4', '#255E91', '#636363', '#264478'],
  ['#ED7D31', '#FFC000', '#70AD47', '#9E480E', '#997300', '#43682B'],
  ['#70AD47', '#4472C4', '#FFC000', '#43682B', '#264478', '#997300'],
]
const EXCEL_MONO_THEMES = [
  ['#45719D', '#4F81BD', '#5D8FC5', '#73A1D0', '#8FAFD6', '#A8BAD0'],
  ['#B45F1F', '#C96F2A', '#DE7B2C', '#E78C5D', '#E4A588', '#E3C3B5'],
  ['#7A7A7A', '#898989', '#979797', '#A5A5A5', '#B2B2B2', '#BFBFBF'],
  ['#BF9000', '#D9A300', '#F3BB00', '#F2C458', '#EACB87', '#E8D2AF'],
  ['#2E4A7F', '#365D9E', '#4E73B6', '#6E89C4', '#97A6CF', '#B6C1DC'],
]
const QUICK_LAYOUTS = [
  { id: 'layout1', label: 'Layout 1', titlePosition: 'above', legendPosition: 'right', showDataLabels: false, showDataTable: false, showAxisTitles: false },
  { id: 'layout2', label: 'Layout 2', titlePosition: 'above', legendPosition: 'bottom', showDataLabels: true, showDataTable: false, showAxisTitles: false },
  { id: 'layout3', label: 'Layout 3', titlePosition: 'overlay', legendPosition: 'right', showDataLabels: true, showDataTable: false, showAxisTitles: true },
  { id: 'layout4', label: 'Layout 4', titlePosition: 'above', legendPosition: 'left', showDataLabels: false, showDataTable: true, showAxisTitles: false },
  { id: 'layout5', label: 'Layout 5', titlePosition: 'above', legendPosition: 'top', showDataLabels: false, showDataTable: true, showAxisTitles: true },
  { id: 'layout6', label: 'Layout 6', titlePosition: 'overlay', legendPosition: 'bottom', showDataLabels: true, showDataTable: true, showAxisTitles: false },
]

function numVal(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return ''
  if (Math.abs(n) >= 1e9) return (n/1e9).toFixed(1)+'B'
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1)+'M'
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1)+'k'
  if (Number.isInteger(n)) return String(n)
  return parseFloat(n.toFixed(2)).toString()
}
function shortLabel(s, max=12) { const str=String(s??''); return str.length>max?str.substring(0,max)+'…':str }
function hexToRgba(hex, alpha=1) {
  if (!hex||!hex.startsWith('#')) return `rgba(0,0,0,${alpha})`
  const r=parseInt(hex.slice(1,3),16)||0, g=parseInt(hex.slice(3,5),16)||0, b=parseInt(hex.slice(5,7),16)||0
  return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,alpha)).toFixed(3)})`
}
function darkenHex(hex, amt=40) {
  const r=Math.max(0,parseInt(hex.slice(1,3),16)-amt)
  const g=Math.max(0,parseInt(hex.slice(3,5),16)-amt)
  const b=Math.max(0,parseInt(hex.slice(5,7),16)-amt)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}
function clampHex(hex) {
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return '#000000'
  return hex
}
function tintHex(hex, amount=0) {
  const c = clampHex(hex)
  const r = parseInt(c.slice(1, 3), 16)
  const g = parseInt(c.slice(3, 5), 16)
  const b = parseInt(c.slice(5, 7), 16)
  const mix = v => Math.max(0, Math.min(255, Math.round(v + (255 - v) * amount)))
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`
}
function shadeHex(hex, amount=0) {
  const c = clampHex(hex)
  const r = parseInt(c.slice(1, 3), 16)
  const g = parseInt(c.slice(3, 5), 16)
  const b = parseInt(c.slice(5, 7), 16)
  const mix = v => Math.max(0, Math.min(255, Math.round(v * (1 - amount))))
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`
}
function buildSeriesPalette(baseColors) {
  const sources = (baseColors && baseColors.length ? baseColors : PALETTE).map(c => clampHex(c))
  return [...sources, ...sources.map(c => tintHex(c, 0.25)), ...sources.map(c => shadeHex(c, 0.2))]
}
function linearRegression(pts) {
  const n=pts.length; if(n<2) return null
  const sumX=pts.reduce((s,p)=>s+p[0],0), sumY=pts.reduce((s,p)=>s+p[1],0)
  const sumXY=pts.reduce((s,p)=>s+p[0]*p[1],0), sumX2=pts.reduce((s,p)=>s+p[0]*p[0],0)
  const denom=n*sumX2-sumX*sumX; if(!denom) return null
  const m=(n*sumXY-sumX*sumY)/denom, b=(sumY-m*sumX)/n
  return {m,b}
}
function smoothPath(pts) {
  if(!pts.length) return ''; if(pts.length===1) return `M${pts[0][0]},${pts[0][1]}`
  let d=`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for(let i=1;i<pts.length;i++){const prev=pts[i-1],curr=pts[i],cpx=(prev[0]+curr[0])/2;d+=` C${cpx.toFixed(1)},${prev[1].toFixed(1)} ${cpx.toFixed(1)},${curr[1].toFixed(1)} ${curr[0].toFixed(1)},${curr[1].toFixed(1)}`}
  return d
}

// ── CSS builder from Format Chart Area state ──────────────────────────────────
function buildContainerStyle(fill, border, shadow, glow, softEdge, chartSize) {
  const style = {}
  if (fill.type==='solid') style.background=hexToRgba(fill.color,(100-fill.transparency)/100)
  else if (fill.type==='gradient') {
    const stops=(fill.gradStops||[]).map(s=>`${hexToRgba(s.color,(100-(s.transparency||0))/100)} ${s.position}%`).join(', ')
    style.background=`linear-gradient(${fill.gradAngle||135}deg, ${stops})`
  }
  if (border.type==='solid') {
    const dm={solid:'solid',dash:'dashed',dot:'dotted',dashDot:'dashed',dashDotDot:'dashed'}
    style.border=`${border.width||1}px ${dm[border.dash]||'solid'} ${border.color||'#30363d'}`
    if(border.radius>0) style.borderRadius=`${border.radius}px`
  }
  const shadows=[]
  if (shadow.type==='outer') {
    const a=(shadow.angle||45)*Math.PI/180, d=shadow.distance||3
    shadows.push(`${(Math.cos(a)*d).toFixed(1)}px ${(Math.sin(a)*d).toFixed(1)}px ${shadow.blur||4}px ${hexToRgba(shadow.color||'#000',(100-(shadow.transparency||60))/100)}`)
  } else if (shadow.type==='inner') {
    const a=(shadow.angle||225)*Math.PI/180, d=shadow.distance||3
    shadows.push(`inset ${(Math.cos(a)*d).toFixed(1)}px ${(Math.sin(a)*d).toFixed(1)}px ${shadow.blur||4}px ${hexToRgba(shadow.color||'#000',(100-(shadow.transparency||60))/100)}`)
  }
  if ((glow.size||0)>0) shadows.push(`0 0 ${glow.size}px ${hexToRgba(glow.color||'#1f6feb',(100-(glow.transparency||50))/100)}`)
  if (shadows.length) style.boxShadow=shadows.join(', ')
  if ((softEdge.size||0)>0) { style.borderRadius=`${softEdge.size}px`; style.overflow='hidden' }
  if (chartSize.widthPx) style.width=`${chartSize.widthPx}px`
  if (chartSize.heightPx) style.minHeight=`${chartSize.heightPx}px`
  return style
}

// ── SVG dimensions ────────────────────────────────────────────────────────────
const CW=580, CH=280

// ══════════════════════════════════════════════════════════════════════════════
// ── COMBO CHART — handles all bar/line/area/scatter + dual axis ───────────────
// ══════════════════════════════════════════════════════════════════════════════
function ComboChart({ rows, traces, xKey, showDataLabels, showGrid, trendline, smooth, xLabel, yLabel, yLabel2, secondaryFormat, barOpacity=85, bevel, showXAxis=true, showYAxis=true, showSecondaryAxis=true, showAxisTitles=true, dataLabelPosition='auto', visual=DEF_VISUAL, selectedSeries=null, onSeriesClick, onHover, hoveredItem }) {
  const n = rows.length; if(!n) return null
  const hasDual = traces.some(t=>t.secondaryAxis)
  const PAD = {
    top: 28,
    right: hasDual && showSecondaryAxis ? 66 : 28,
    bottom: showXAxis ? 72 : 40,
    left: showYAxis ? 76 : 28,
  }
  const cW=CW-PAD.left-PAD.right, cH=CH-PAD.top-PAD.bottom, TICKS=5

  const barTraces  = traces.filter(t=>!t.type||t.type==='bar')
  const hbarTraces = traces.filter(t=>t.type==='hbar')
  const lineTraces = traces.filter(t=>t.type==='line'||t.type==='area'||t.type==='scatter')

  // Y scales
  const primTraces = traces.filter(t=>!t.secondaryAxis)
  const secTraces  = traces.filter(t=>t.secondaryAxis)
  const primVals   = primTraces.flatMap(t=>rows.map(r=>numVal(r[t.yKey]))).filter(v=>isFinite(v))
  const secVals    = secTraces.flatMap(t=>rows.map(r=>numVal(r[t.yKey]))).filter(v=>isFinite(v))
  const primMax    = Math.max(...(primVals.length?primVals:[0]), 1)
  const secMax     = Math.max(...(secVals.length?secVals:[0]), 1)
  const py = v => PAD.top+(1-v/primMax)*cH
  const sy = v => PAD.top+(1-v/secMax)*cH
  const scaleY = tr => tr.secondaryAxis ? sy : py

  // X positioning
  const slotW = cW/n
  const numBarTraces = barTraces.length
  const groupW = slotW*0.78
  const barW = numBarTraces>0 ? Math.max(4, groupW/numBarTraces) : 0
  const slotCx = i => PAD.left+(i+0.5)*slotW
  const barX   = (i,j) => PAD.left+i*slotW+(slotW-groupW)/2+j*barW

  // Secondary label formatter
  const fmtSec = v => {
    if (secondaryFormat==='percent') return (v*100).toFixed(1)+'%'
    if (secondaryFormat==='auto'&&secMax<=1.5) return (v*100).toFixed(0)+'%'
    return fmtNum(v)
  }
  const fmtLabel = (tr, v) => {
    if (tr.secondaryAxis) return fmtSec(v)
    return fmtNum(v)
  }

  // 3D bevel: top highlight rect
  const bevelOn = bevel && bevel.topBevel && bevel.topBevel.type && bevel.topBevel.type !== 'None'
  const depthOn = bevel && bevel.depth && bevel.depth.size > 0
  const depthDx = depthOn ? Math.min(bevel.depth.size*0.5, 8) : 0
  const depthDy = depthOn ? Math.min(bevel.depth.size*0.4, 6) : 0

  return (
    <svg width="100%" viewBox={`0 0 ${CW} ${CH}`} style={{overflow:'visible'}}>
      {/* Grid */}
      {showGrid && showYAxis && Array.from({length:TICKS+1}).map((_,i)=>{
        const y=PAD.top+cH*(1-i/TICKS)
        return <line key={i} x1={PAD.left} y1={y} x2={CW-PAD.right} y2={y} stroke={visual.gridColor} strokeWidth="1"/>
      })}

      {/* Left Y-axis ticks */}
      {showYAxis && Array.from({length:TICKS+1}).map((_,i)=>{
        const y=PAD.top+cH*(1-i/TICKS)
        return <text key={i} x={PAD.left-6} y={y+3} textAnchor="end" fontSize="9" fill={visual.yTickColor}>{fmtNum(primMax*i/TICKS)}</text>
      })}

      {/* Right Y-axis ticks */}
      {hasDual && showSecondaryAxis && Array.from({length:TICKS+1}).map((_,i)=>{
        const y=PAD.top+cH*(1-i/TICKS)
        return <text key={i} x={CW-PAD.right+6} y={y+3} textAnchor="start" fontSize="9" fill={visual.y2TickColor}>{fmtSec(secMax*i/TICKS)}</text>
      })}

      {/* Axis lines */}
      {showYAxis && <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={CH-PAD.bottom} stroke={visual.axisLineColor} strokeWidth="1.5"/>}
      {showXAxis && <line x1={PAD.left} y1={CH-PAD.bottom} x2={CW-PAD.right} y2={CH-PAD.bottom} stroke={visual.axisLineColor} strokeWidth="1.5"/>}
      {hasDual && showSecondaryAxis && <line x1={CW-PAD.right} y1={PAD.top} x2={CW-PAD.right} y2={CH-PAD.bottom} stroke={visual.axisLineColor} strokeWidth="1.5"/>}
      {showAxisTitles && showXAxis && xLabel&&<text x={PAD.left+cW/2} y={CH-4} textAnchor="middle" fontSize="10" fill={visual.xTitleColor} fontWeight="600">{xLabel}</text>}
      {showAxisTitles && showYAxis && yLabel&&<text x={12} y={PAD.top+cH/2} textAnchor="middle" fontSize="10" fill={visual.yTitleColor} fontWeight="600" transform={`rotate(-90,12,${PAD.top+cH/2})`}>{yLabel}</text>}
      {showAxisTitles && hasDual&&showSecondaryAxis&&yLabel2&&<text x={CW-8} y={PAD.top+cH/2} textAnchor="middle" fontSize="10" fill={visual.y2TitleColor} fontWeight="600" transform={`rotate(90,${CW-8},${PAD.top+cH/2})`}>{yLabel2}</text>}

      {/* Bar traces (grouped side-by-side) */}
      {barTraces.map((tr,j)=>rows.map((r,i)=>{
        const v=numVal(r[tr.yKey]); const bH=Math.max(0,(v/primMax)*cH)
        const x=barX(i,j), y=CH-PAD.bottom-bH, bwAdj=barW-1
        const showTraceLabels = tr.showDataLabels ?? showDataLabels
        const traceLabelPosition = tr.dataLabelPosition ?? dataLabelPosition
        const trIdx = traces.indexOf(tr)
        const isSelected = selectedSeries===null || selectedSeries===trIdx
        const isHovered = hoveredItem && hoveredItem.trIdx===trIdx && hoveredItem.rowIdx===i
        const sf = tr.seriesFmt || DEF_SERIES_FORMAT
        const traceBarOpacity = tr.barOpacity ?? barOpacity
        const effOpacity = (traceBarOpacity/100) * (isSelected ? 1 : 0.22) * ((100 - sf.fillTransparency) / 100)
        const strokeProps = sf.borderType==='solid' ? {
          stroke: sf.borderColor || darkenHex(tr.color, 30),
          strokeWidth: isHovered ? (sf.borderWidth||1.5)+0.8 : (sf.borderWidth||1.5),
          strokeDasharray: sf.borderDash==='dash'?'5 3':sf.borderDash==='dot'?'2 3':undefined,
        } : isHovered ? {stroke:tr.color, strokeWidth:1.5} : {}
        return <g key={`b${j}-${i}`}
          style={{cursor:'pointer'}}
          onDoubleClick={e=>{e.stopPropagation();onSeriesClick&&onSeriesClick(trIdx)}}
          onMouseMove={e=>onHover&&onHover({trIdx,rowIdx:i,label:r[xKey],value:v,seriesName:tr.name||tr.yKey,color:tr.color,clientX:e.clientX,clientY:e.clientY})}
          onMouseLeave={()=>onHover&&onHover(null)}>
          {/* 3D depth – right face */}
          {depthOn&&bH>0&&<polygon
            points={`${x+bwAdj},${y} ${x+bwAdj+depthDx},${y-depthDy} ${x+bwAdj+depthDx},${CH-PAD.bottom-depthDy} ${x+bwAdj},${CH-PAD.bottom}`}
            fill={darkenHex(tr.color,50)} opacity={effOpacity*0.85}/>}
          {/* 3D depth – top face */}
          {depthOn&&bH>0&&<polygon
            points={`${x},${y} ${x+bwAdj},${y} ${x+bwAdj+depthDx},${y-depthDy} ${x+depthDx},${y-depthDy}`}
            fill={darkenHex(tr.color,-30)} opacity={effOpacity*0.9}/>}
          {/* Main bar */}
          <rect x={x} y={y} width={bwAdj} height={bH} fill={tr.color} opacity={effOpacity} rx="2" {...strokeProps}>
            <title>{`${r[xKey]}: ${v}`}</title>
          </rect>
          {/* Bevel highlight */}
          {bevelOn&&bH>0&&<rect x={x} y={y} width={bwAdj} height={Math.min(bevel.topBevel.height||6,bH)} fill="rgba(255,255,255,0.28)" rx="2"/>}
          {/* Data labels */}
          {showTraceLabels&&traceLabelPosition!=='none'&&bH>0&&(
            <text
              x={x+bwAdj/2}
              y={
                traceLabelPosition==='center'
                  ? y + Math.max(10, bH / 2 + 3)
                  : traceLabelPosition==='insideEnd'
                    ? y + 11
                    : y - 3
              }
              textAnchor="middle"
              fontSize="9"
              fill={tr.labelColor || (traceLabelPosition==='outsideEnd' || (traceLabelPosition==='auto'&&bH<=14) ? tr.color : 'rgba(255,255,255,0.9)')}
              fontWeight="600"
              opacity={isSelected?1:0.3}
            >
              {fmtNum(v)}
            </text>
          )}
        </g>
      }))}

      {/* X-axis category labels */}
      {showXAxis && rows.map((r,i)=>{
        const x=slotCx(i)
        return <text key={i} x={x} y={CH-PAD.bottom+14} textAnchor="middle" fontSize="9" fill={visual.xTickColor}
          transform={n>10?`rotate(-35,${x},${CH-PAD.bottom+14})`:undefined}>{shortLabel(r[xKey])}</text>
      })}

      {/* Line / area / scatter traces */}
      {lineTraces.map((tr,ti)=>{
        const sY = scaleY(tr)
        const pts = rows.map((r,i)=>[slotCx(i), sY(numVal(r[tr.yKey]))])
        const trIdx = traces.indexOf(tr)
        const isSelected = selectedSeries===null || selectedSeries===trIdx
        const sf = tr.seriesFmt || DEF_SERIES_FORMAT
        const traceLabelPosition = tr.dataLabelPosition ?? dataLabelPosition
        const traceSmooth = tr.smoothLine ?? smooth
        const traceTrendline = tr.showTrendline ?? trendline
        const lineOpacity = isSelected ? 1 : 0.2
        const strokeColor = sf.borderType==='solid' ? (sf.borderColor || tr.color) : tr.color
        const strokeW = sf.borderType==='solid' ? (sf.borderWidth||2.5) : 2.5
        const strokeDash = sf.borderType==='solid' && sf.borderDash==='dash'?'5 3':sf.borderType==='solid'&&sf.borderDash==='dot'?'2 3':undefined
        if (tr.type==='scatter') return pts.map((p,i)=>(
          <circle key={i} cx={p[0]} cy={p[1]} r={hoveredItem&&hoveredItem.trIdx===trIdx&&hoveredItem.rowIdx===i?6:5}
            fill={tr.color} opacity={isSelected?(100-sf.fillTransparency)/100*0.72:0.18}
            stroke={sf.borderType==='solid'?(sf.borderColor||tr.color):undefined} strokeWidth={sf.borderType==='solid'?(sf.borderWidth||1.5):0}
            style={{cursor:'pointer'}}
            onDoubleClick={e=>{e.stopPropagation();onSeriesClick&&onSeriesClick(trIdx)}}
            onMouseMove={e=>onHover&&onHover({trIdx,rowIdx:i,label:rows[i][xKey],value:numVal(rows[i][tr.yKey]),seriesName:tr.name||tr.yKey,color:tr.color,clientX:e.clientX,clientY:e.clientY})}
            onMouseLeave={()=>onHover&&onHover(null)}>
            <title>{`${rows[i][xKey]}: ${rows[i][tr.yKey]}`}</title>
          </circle>
        ))
        const pathD = traceSmooth ? smoothPath(pts) : pts.map((p,k)=>`${k===0?'M':'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
        const areaD = tr.type==='area'&&pts.length>0
          ? `${pathD} L${pts[pts.length-1][0].toFixed(1)},${CH-PAD.bottom} L${pts[0][0].toFixed(1)},${CH-PAD.bottom} Z` : ''
        const gradId=`ag_${(tr.yKey||'y').replace(/[^a-z0-9]/gi,'')}_${ti}`
        let trendEl=null
        if (traceTrendline&&pts.length>=2) {
          const reg=linearRegression(pts); if(reg) { const x1=pts[0][0],x2=pts[pts.length-1][0]; trendEl=<line x1={x1} y1={reg.m*x1+reg.b} x2={x2} y2={reg.m*x2+reg.b} stroke={tr.color} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.6"/> }
        }
        return <g key={`l${ti}`} style={{cursor:'pointer'}} onDoubleClick={e=>{e.stopPropagation();onSeriesClick&&onSeriesClick(trIdx)}}>
          {tr.type==='area'&&<><defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={tr.color} stopOpacity={isSelected?0.28:0.06}/><stop offset="100%" stopColor={tr.color} stopOpacity="0.03"/></linearGradient></defs><path d={areaD} fill={`url(#${gradId})`}/></>}
          <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={strokeW} strokeDasharray={strokeDash} strokeLinejoin="round" opacity={lineOpacity}/>
          {trendEl}
          {pts.map((p,i)=>(
            <circle key={i} cx={p[0]} cy={p[1]} r={hoveredItem&&hoveredItem.trIdx===trIdx&&hoveredItem.rowIdx===i?5:3.5}
              fill={tr.color} stroke="#0d1117" strokeWidth="1.5" opacity={lineOpacity}
              onMouseMove={e=>onHover&&onHover({trIdx,rowIdx:i,label:rows[i][xKey],value:numVal(rows[i][tr.yKey]),seriesName:tr.name||tr.yKey,color:tr.color,clientX:e.clientX,clientY:e.clientY})}
              onMouseLeave={()=>onHover&&onHover(null)}>
              <title>{`${rows[i][xKey]}: ${rows[i][tr.yKey]}`}</title>
            </circle>
          ))}
          {(tr.showDataLabels ?? showDataLabels)&&traceLabelPosition!=='none'&&pts.map((p,i)=>(
            <text key={i} x={p[0]} y={traceLabelPosition==='center'?p[1]+3:traceLabelPosition==='insideEnd'?p[1]-4:p[1]-8} textAnchor="middle" fontSize="9" fill={tr.labelColor||tr.color} fontWeight="600" opacity={isSelected?1:0.2}>
              {fmtLabel(tr, numVal(rows[i][tr.yKey]))}
            </text>
          ))}
        </g>
      })}
    </svg>
  )
}

// ── Stacked Bar Chart ─────────────────────────────────────────────────────────
function StackedBarChart({ rows, traces, xKey, normalized, showDataLabels, showGrid, gridColor='#2a3038', yTickColor='#6e7681', axisLineColor='#30363d', xTickColor='#8b949e', dataLabelPosition='auto', barOpacity=85, selectedSeries=null, onSeriesClick, onHover, hoveredItem }) {
  const PAD={top:28,right:28,bottom:72,left:76}
  const cW=CW-PAD.left-PAD.right, cH=CH-PAD.top-PAD.bottom, TICKS=5
  const stacks=rows.map(r=>{const vals=traces.map(t=>Math.max(0,numVal(r[t.yKey])));const total=vals.reduce((s,v)=>s+v,0)||1;return{vals,total}})
  const maxTotal=normalized?100:Math.max(...stacks.map(s=>s.total),1)
  const barW=Math.max(5,cW/rows.length-3)
  return (
    <svg width="100%" viewBox={`0 0 ${CW} ${CH}`} style={{overflow:'visible'}}>
      {showGrid&&Array.from({length:TICKS+1}).map((_,i)=>{const y=PAD.top+cH*(1-i/TICKS);return<line key={i} x1={PAD.left} y1={y} x2={CW-PAD.right} y2={y} stroke={gridColor} strokeWidth="1"/>})}
      {Array.from({length:TICKS+1}).map((_,i)=>{const y=PAD.top+cH*(1-i/TICKS);const val=normalized?(100*i/TICKS).toFixed(0)+'%':fmtNum(maxTotal*i/TICKS);return<text key={i} x={PAD.left-6} y={y+3} textAnchor="end" fontSize="9" fill={yTickColor}>{val}</text>})}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={CH-PAD.bottom} stroke={axisLineColor} strokeWidth="1.5"/>
      <line x1={PAD.left} y1={CH-PAD.bottom} x2={CW-PAD.right} y2={CH-PAD.bottom} stroke={axisLineColor} strokeWidth="1.5"/>
      {rows.map((r,i)=>{
        const x=PAD.left+i*(cW/rows.length)+(cW/rows.length-barW)/2; let cumH=0
        return <g key={i}>{traces.map((tr,ti)=>{
          const rawV=Math.max(0,numVal(r[tr.yKey]));const dV=normalized?(rawV/stacks[i].total)*100:rawV;const bH=(dV/maxTotal)*cH;const y=CH-PAD.bottom-cumH-bH;cumH+=bH;
          const showTraceLabels=tr.showDataLabels??showDataLabels;
          const traceLabelPosition=tr.dataLabelPosition??dataLabelPosition;
          const isSelected=selectedSeries===null||selectedSeries===ti;
          const isHovered=hoveredItem&&hoveredItem.trIdx===ti&&hoveredItem.rowIdx===i;
          const sf=tr.seriesFmt||DEF_SERIES_FORMAT;
          const traceBarOpacity=tr.barOpacity??barOpacity;
          const effOpacity=(traceBarOpacity/100)*(isSelected?1:0.2)*((100-sf.fillTransparency)/100);
          const strokeProps=sf.borderType==='solid'?{stroke:sf.borderColor||darkenHex(tr.color,20),strokeWidth:isHovered?(sf.borderWidth||1.5)+0.8:(sf.borderWidth||1.5),strokeDasharray:sf.borderDash==='dash'?'5 3':sf.borderDash==='dot'?'2 3':undefined}:isHovered?{stroke:tr.color,strokeWidth:1.5}:{};
          return<g key={ti} style={{cursor:'pointer'}}
            onDoubleClick={e=>{e.stopPropagation();onSeriesClick&&onSeriesClick(ti)}}
            onMouseMove={e=>onHover&&onHover({trIdx:ti,rowIdx:i,label:r[xKey],value:rawV,seriesName:tr.name||tr.yKey,color:tr.color,clientX:e.clientX,clientY:e.clientY})}
            onMouseLeave={()=>onHover&&onHover(null)}>
            <rect x={x} y={y} width={barW} height={bH} fill={tr.color} opacity={effOpacity} rx={ti===0?2:0} {...strokeProps}><title>{`${r[xKey]}·${tr.yKey}:${rawV}`}</title></rect>
            {showTraceLabels&&traceLabelPosition!=='none'&&bH>12&&<text x={x+barW/2} y={traceLabelPosition==='center'?y+bH/2+4:traceLabelPosition==='insideEnd'?y+11:y-3} textAnchor="middle" fontSize="8" fill={tr.labelColor||'rgba(255,255,255,0.9)'} fontWeight="600" opacity={isSelected?1:0.2}>{normalized?(rawV/stacks[i].total*100).toFixed(0)+'%':fmtNum(rawV)}</text>}
          </g>})}
        <text x={x+barW/2} y={CH-PAD.bottom+14} textAnchor="middle" fontSize="9" fill={xTickColor} transform={rows.length>10?`rotate(-35,${x+barW/2},${CH-PAD.bottom+14})`:undefined}>{shortLabel(r[xKey])}</text>
        </g>
      })}
    </svg>
  )
}

// ── Pie Chart ─────────────────────────────────────────────────────────────────
function PieChart({ rows, labelKey, valueKey, colors, showDataLabels, labelColor='#ffffff', titleColor='#e6edf3', tickColor='#6e7681', selectedSeries=null, onSeriesClick, onHover, hoveredItem }) {
  const W2=340,H2=270,cx=170,cy=135,R=108,Ri=50
  const vals=rows.map(r=>Math.abs(numVal(r[valueKey]))); const total=vals.reduce((s,v)=>s+v,0)||1
  let angle=-Math.PI/2
  const slices=rows.map((r,i)=>{const pct=vals[i]/total;const a0=angle;const a1=angle+pct*2*Math.PI;angle=a1;return{r,i,pct,a0,a1,lA:(a0+a1)/2,color:colors[i%colors.length],val:vals[i]}})
  const arc=(cx,cy,r,a0,a1)=>{const x1=cx+r*Math.cos(a0),y1=cy+r*Math.sin(a0),x2=cx+r*Math.cos(a1),y2=cy+r*Math.sin(a1);return`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${a1-a0>Math.PI?1:0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
  return (
    <svg width={W2} height={H2} viewBox={`0 0 ${W2} ${H2}`}>
      {slices.map(s=>{
        const large=s.a1-s.a0>Math.PI?1:0;const ix1=cx+Ri*Math.cos(s.a0),iy1=cy+Ri*Math.sin(s.a0),ix2=cx+Ri*Math.cos(s.a1),iy2=cy+Ri*Math.sin(s.a1);const d=`${arc(cx,cy,R,s.a0,s.a1)} L ${ix2.toFixed(2)} ${iy2.toFixed(2)} A ${Ri} ${Ri} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`;
        const isSelected=selectedSeries===null||selectedSeries===s.i;
        const isHovered=hoveredItem&&hoveredItem.rowIdx===s.i;
        const rOff=isHovered?6:0; const offX=Math.cos(s.lA)*rOff, offY=Math.sin(s.lA)*rOff;
        return<g key={s.i} style={{cursor:'pointer'}} transform={rOff?`translate(${offX.toFixed(1)},${offY.toFixed(1)})`:''}
          onDoubleClick={e=>{e.stopPropagation();onSeriesClick&&onSeriesClick(s.i)}}
          onMouseMove={e=>onHover&&onHover({trIdx:s.i,rowIdx:s.i,label:s.r[labelKey],value:s.val,seriesName:s.r[labelKey],color:s.color,pct:s.pct,clientX:e.clientX,clientY:e.clientY})}
          onMouseLeave={()=>onHover&&onHover(null)}>
          <path d={d} fill={s.color} stroke="#0d1117" strokeWidth={isHovered?2:1.5} opacity={isSelected?0.88:0.25}/>
        </g>
      })}
      {slices.filter(s=>s.pct>0.04).map(s=>{const r2=(R+Ri)/2;const lx=cx+r2*Math.cos(s.lA),ly=cy+r2*Math.sin(s.lA);const isSelected=selectedSeries===null||selectedSeries===s.i;return<g key={s.i}><text x={lx.toFixed(1)} y={ly.toFixed(1)} textAnchor="middle" fontSize="9" fill={labelColor} fontWeight="700" opacity={isSelected?1:0.3}>{(s.pct*100).toFixed(0)}%</text>{showDataLabels&&s.pct>0.07&&<text x={lx.toFixed(1)} y={(parseFloat(ly)+11).toFixed(1)} textAnchor="middle" fontSize="8" fill={labelColor} opacity={isSelected?1:0.3}>{fmtNum(s.val)}</text>}</g>})}
      <text x={cx} y={cy-4} textAnchor="middle" fontSize="13" fill={titleColor} fontWeight="700">{fmtNum(total)}</text>
      <text x={cx} y={cy+12} textAnchor="middle" fontSize="9" fill={tickColor}>total</text>
    </svg>
  )
}

// ── Histogram ─────────────────────────────────────────────────────────────────
function HistogramChart({ rows, xKey, color, showGrid, showDataLabels, labelColor, gridColor='#2a3038', yTickColor='#6e7681', axisLineColor='#30363d', xTickColor='#8b949e' }) {
  const BINS=12, PAD={top:28,right:28,bottom:72,left:76}
  const vals=rows.map(r=>numVal(r[xKey])).filter(v=>isFinite(v)); if(!vals.length) return null
  const minV=Math.min(...vals),maxV=Math.max(...vals,minV+1),binW=(maxV-minV)/BINS
  const bins=Array.from({length:BINS},(_,i)=>({start:minV+i*binW,end:minV+(i+1)*binW,count:0}))
  vals.forEach(v=>{const i=Math.min(Math.floor((v-minV)/binW),BINS-1);bins[i].count++})
  const maxC=Math.max(...bins.map(b=>b.count),1); const cW=CW-PAD.left-PAD.right,cH=CH-PAD.top-PAD.bottom,bW=cW/BINS-2
  return(
    <svg width="100%" viewBox={`0 0 ${CW} ${CH}`} style={{overflow:'visible'}}>
      {showGrid&&Array.from({length:6}).map((_,i)=>{const y=PAD.top+cH*(1-i/5);return<line key={i} x1={PAD.left} y1={y} x2={CW-PAD.right} y2={y} stroke={gridColor} strokeWidth="1"/>})}
      {Array.from({length:6}).map((_,i)=>{const y=PAD.top+cH*(1-i/5);return<text key={i} x={PAD.left-6} y={y+3} textAnchor="end" fontSize="9" fill={yTickColor}>{Math.round(maxC*i/5)}</text>})}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={CH-PAD.bottom} stroke={axisLineColor} strokeWidth="1.5"/>
      <line x1={PAD.left} y1={CH-PAD.bottom} x2={CW-PAD.right} y2={CH-PAD.bottom} stroke={axisLineColor} strokeWidth="1.5"/>
      {bins.map((b,i)=>{const bH=(b.count/maxC)*cH,x=PAD.left+i*(cW/BINS)+1,lx=x+bW/2;return<g key={i}><rect x={x} y={CH-PAD.bottom-bH} width={bW} height={bH} fill={color} opacity="0.82" rx="2"><title>{`${b.start.toFixed(1)}–${b.end.toFixed(1)}: ${b.count}`}</title></rect>{showDataLabels&&bH>14&&<text x={lx} y={CH-PAD.bottom-bH-3} textAnchor="middle" fontSize="8" fill={labelColor||color}>{b.count}</text>}{i%2===0&&<text x={lx} y={CH-PAD.bottom+14} textAnchor="middle" fontSize="9" fill={xTickColor} transform={`rotate(-30,${lx},${CH-PAD.bottom+14})`}>{b.start.toFixed(1)}</text>}</g>})}
    </svg>
  )
}

// ── Radar ─────────────────────────────────────────────────────────────────────
function RadarChart({ rows, xKey, traces, showDataLabels, showGrid, gridColor='#2a3038', xTickColor='#8b949e' }) {
  const W2=340,H2=300,cx=170,cy=150,R=110; const N=Math.min(rows.length,12)
  if(N<3) return <svg width={W2} height={H2}><text x={cx} y={cy} textAnchor="middle" fill="#6e7681" fontSize="11">Need ≥3 rows</text></svg>
  const angle=i=>-Math.PI/2+(2*Math.PI*i)/N
  const maxVal=Math.max(...traces.flatMap(tr=>rows.slice(0,N).map(r=>numVal(r[tr.yKey]))),1)
  return(
    <svg width={W2} height={H2} viewBox={`0 0 ${W2} ${H2}`}>
      {showGrid&&[0.25,0.5,0.75,1].map(f=><polygon key={f} points={Array.from({length:N},(_,i)=>`${cx+R*f*Math.cos(angle(i))},${cy+R*f*Math.sin(angle(i))}`).join(' ')} fill="none" stroke={gridColor} strokeWidth="1"/>)}
      {Array.from({length:N},(_,i)=><line key={i} x1={cx} y1={cy} x2={cx+R*Math.cos(angle(i))} y2={cy+R*Math.sin(angle(i))} stroke={gridColor} strokeWidth="1"/>)}
      {rows.slice(0,N).map((r,i)=>{const a=angle(i);return<text key={i} x={(cx+(R+18)*Math.cos(a)).toFixed(1)} y={(cy+(R+18)*Math.sin(a)+3).toFixed(1)} textAnchor="middle" fontSize="9" fill={xTickColor}>{shortLabel(String(r[xKey]??''),11)}</text>})}
      {traces.map((tr,ti)=>{const pts=rows.slice(0,N).map((r,i)=>{const v=numVal(r[tr.yKey]),a=angle(i),r2=(v/maxVal)*R;return{x:cx+r2*Math.cos(a),y:cy+r2*Math.sin(a),v,a,r2}});const showTraceLabels=tr.showDataLabels??showDataLabels;return<g key={ti}><polygon points={pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill={tr.color} fillOpacity="0.12" stroke={tr.color} strokeWidth="2"/>{pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3.5" fill={tr.color} stroke="#0d1117" strokeWidth="1"><title>{`${rows[i][xKey]}·${tr.yKey}:${p.v}`}</title></circle>)}{showTraceLabels&&pts.map((p,i)=><text key={i} x={(cx+(p.r2+12)*Math.cos(p.a)).toFixed(1)} y={(cy+(p.r2+12)*Math.sin(p.a)+3).toFixed(1)} textAnchor="middle" fontSize="8" fill={tr.labelColor||tr.color} fontWeight="600">{fmtNum(p.v)}</text>)}</g>})}
    </svg>
  )
}

// ── Recharts chart components ─────────────────────────────────────────────────
const R_TOOLTIP = {
  contentStyle: { background: 'rgba(13,17,23,0.97)', border: '1px solid #30363d', borderRadius: 8, padding: '8px 12px', fontSize: 11, boxShadow: '0 8px 28px rgba(0,0,0,0.5)' },
  itemStyle: { color: '#e6edf3' },
  labelStyle: { color: '#8b949e', marginBottom: 4 },
  cursor: { fill: 'rgba(255,255,255,0.05)' },
}

function RComboChart({ rows, traces, xKey, showDataLabels, showGrid, trendline, smooth, xLabel, yLabel, yLabel2, secondaryFormat, barOpacity=85, showXAxis=true, showYAxis=true, showSecondaryAxis=true, showAxisTitles=true, visual=DEF_VISUAL, fullscreen=false }) {
  if (!rows.length) return null
  const chartHeight = fullscreen ? 500 : 320
  const hasHBar = traces.some(t => t.type === 'hbar')
  const hasDual = traces.some(t => t.secondaryAxis)
  const fmtSec = v => secondaryFormat === 'percent' ? (v * 100).toFixed(1) + '%' : fmtNum(v)

  const baseData = rows.map(r => {
    const pt = { __x: r[xKey] }
    traces.forEach(tr => { if (tr.yKey) pt[tr.name || tr.yKey] = numVal(r[tr.yKey]) })
    return pt
  })

  const trendKeys = []
  if (trendline && !hasHBar) {
    traces.filter(tr => ['line','area','scatter'].includes(tr.type||'bar') && tr.yKey).forEach(tr => {
      const pts = baseData.map((d, j) => [j, d[tr.name || tr.yKey] ?? 0])
      const reg = linearRegression(pts)
      if (reg) {
        const tk = `__trend_${tr.name || tr.yKey}`
        baseData.forEach((d, j) => { d[tk] = parseFloat((reg.m * j + reg.b).toFixed(4)) })
        trendKeys.push({ key: tk, color: tr.color, yAxisId: tr.secondaryAxis ? 'right' : 'left' })
      }
    })
  }

  if (hasHBar) {
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={baseData} layout="vertical" margin={{ top: 10, right: 40, bottom: 10, left: 60 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={visual.gridColor} horizontal={false} />}
          {showXAxis && <XAxis type="number" tickFormatter={fmtNum} tick={{ fontSize: 9, fill: visual.yTickColor }} label={showAxisTitles && xLabel ? { value: xLabel, position: 'insideBottom', offset: -12, fontSize: 10, fill: visual.xTitleColor } : null} />}
          {showYAxis && <YAxis type="category" dataKey="__x" tick={{ fontSize: 9, fill: visual.xTickColor }} width={55} label={showAxisTitles && yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: visual.yTitleColor } : null} />}
          <RTooltip {...R_TOOLTIP} formatter={(v, n) => [fmtNum(v), n]} />
          {traces.filter(tr => tr.yKey).map((tr, i) => {
            const key = tr.name || tr.yKey
            const showLabels = tr.showDataLabels ?? showDataLabels
            return (
              <Bar key={i} dataKey={key} fill={hexToRgba(tr.color, (tr.barOpacity ?? barOpacity) / 100)} radius={[0, 3, 3, 0]}>
                {showLabels && <LabelList dataKey={key} position="right" style={{ fontSize: 9, fill: tr.labelColor || tr.color }} formatter={fmtNum} />}
              </Bar>
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <ComposedChart data={baseData} margin={{ top: 10, right: hasDual && showSecondaryAxis ? 64 : 20, bottom: showAxisTitles && xLabel ? 32 : 10, left: 20 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={visual.gridColor} />}
        {showXAxis && <XAxis dataKey="__x" tick={{ fontSize: 9, fill: visual.xTickColor }} tickFormatter={v => shortLabel(String(v ?? ''), 14)} label={showAxisTitles && xLabel ? { value: xLabel, position: 'insideBottom', offset: -12, fontSize: 10, fill: visual.xTitleColor } : null} />}
        {showYAxis && <YAxis yAxisId="left" tickFormatter={fmtNum} tick={{ fontSize: 9, fill: visual.yTickColor }} width={56} label={showAxisTitles && yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: visual.yTitleColor } : null} />}
        {hasDual && showSecondaryAxis && <YAxis yAxisId="right" orientation="right" tickFormatter={fmtSec} tick={{ fontSize: 9, fill: visual.y2TickColor }} width={56} label={showAxisTitles && yLabel2 ? { value: yLabel2, angle: 90, position: 'insideRight', offset: -10, fontSize: 10, fill: visual.y2TitleColor } : null} />}
        <RTooltip {...R_TOOLTIP} formatter={(v, n) => [fmtNum(v), n]} />
        {traces.filter(tr => tr.yKey).map((tr, i) => {
          const key = tr.name || tr.yKey
          const yAxisId = tr.secondaryAxis ? 'right' : 'left'
          const type = tr.type || 'bar'
          const showLabels = tr.showDataLabels ?? showDataLabels
          const traceSmooth = tr.smoothLine ?? smooth
          if (type === 'line') return (
            <Line key={i} type={traceSmooth ? 'monotone' : 'linear'} dataKey={key} stroke={tr.color} strokeWidth={2} dot={{ r: 3, fill: tr.color, stroke: '#0d1117', strokeWidth: 1 }} activeDot={{ r: 5 }} yAxisId={yAxisId}>
              {showLabels && <LabelList dataKey={key} position="top" style={{ fontSize: 9, fill: tr.labelColor || tr.color }} formatter={fmtNum} />}
            </Line>
          )
          if (type === 'area') return (
            <Area key={i} type={traceSmooth ? 'monotone' : 'linear'} dataKey={key} stroke={tr.color} fill={hexToRgba(tr.color, 0.28)} strokeWidth={2} dot={{ r: 3, fill: tr.color, stroke: '#0d1117', strokeWidth: 1 }} activeDot={{ r: 5 }} yAxisId={yAxisId}>
              {showLabels && <LabelList dataKey={key} position="top" style={{ fontSize: 9, fill: tr.labelColor || tr.color }} formatter={fmtNum} />}
            </Area>
          )
          if (type === 'scatter') return (
            <Line key={i} type="linear" dataKey={key} stroke="none" dot={{ r: 5, fill: tr.color, stroke: '#0d1117', strokeWidth: 1 }} activeDot={{ r: 6 }} yAxisId={yAxisId}>
              {showLabels && <LabelList dataKey={key} position="top" style={{ fontSize: 9, fill: tr.labelColor || tr.color }} formatter={fmtNum} />}
            </Line>
          )
          return (
            <Bar key={i} dataKey={key} fill={hexToRgba(tr.color, (tr.barOpacity ?? barOpacity) / 100)} yAxisId={yAxisId} radius={[3, 3, 0, 0]}>
              {showLabels && <LabelList dataKey={key} position="insideTop" style={{ fontSize: 9, fill: tr.labelColor || '#ffffffcc' }} formatter={fmtNum} />}
            </Bar>
          )
        })}
        {trendKeys.map((tl, i) => (
          <Line key={`tl${i}`} type="linear" dataKey={tl.key} stroke={tl.color} strokeDasharray="5 3" strokeWidth={1.5} dot={false} activeDot={false} yAxisId={tl.yAxisId} opacity={0.65} legendType="none" />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function RStackedBarChart({ rows, traces, xKey, normalized, showDataLabels, showGrid, gridColor='#2a3038', yTickColor='#6e7681', xTickColor='#8b949e', barOpacity=85, fullscreen=false }) {
  if (!rows.length || !traces.length) return null
  const chartHeight = fullscreen ? 500 : 320
  const data = rows.map(r => {
    const pt = { __x: r[xKey] }
    if (normalized) {
      const total = traces.reduce((s, tr) => s + Math.max(0, numVal(r[tr.yKey])), 0) || 1
      traces.forEach(tr => { pt[tr.name || tr.yKey] = parseFloat(((Math.max(0, numVal(r[tr.yKey])) / total) * 100).toFixed(2)) })
    } else {
      traces.forEach(tr => { pt[tr.name || tr.yKey] = Math.max(0, numVal(r[tr.yKey])) })
    }
    return pt
  })
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />}
        <XAxis dataKey="__x" tick={{ fontSize: 9, fill: xTickColor }} tickFormatter={v => shortLabel(String(v ?? ''), 14)} />
        <YAxis tickFormatter={normalized ? v => v + '%' : fmtNum} tick={{ fontSize: 9, fill: yTickColor }} domain={normalized ? [0, 100] : undefined} />
        <RTooltip {...R_TOOLTIP} formatter={normalized ? v => [v.toFixed(1) + '%'] : v => [fmtNum(v)]} />
        {traces.map((tr, i) => (
          <Bar key={i} dataKey={tr.name || tr.yKey} stackId="a" fill={hexToRgba(tr.color, (tr.barOpacity ?? barOpacity) / 100)} radius={i === traces.length - 1 ? [3, 3, 0, 0] : undefined}>
            {(tr.showDataLabels ?? showDataLabels) && <LabelList dataKey={tr.name || tr.yKey} position="center" style={{ fontSize: 9, fill: '#ffffffcc' }} formatter={normalized ? v => v.toFixed(0) + '%' : fmtNum} />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function RPieChartComp({ rows, labelKey, valueKey, colors, showDataLabels, fullscreen=false }) {
  if (!rows.length) return null
  const chartHeight = fullscreen ? 500 : 320
  const data = rows.map((r, i) => ({
    name: String(r[labelKey] ?? ''),
    value: Math.abs(numVal(r[valueKey])),
    fill: colors[i % colors.length],
  })).filter(d => d.value > 0)
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.04) return null
    const rad = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * rad)
    const y = cy + radius * Math.sin(-midAngle * rad)
    return <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight="700">{(percent * 100).toFixed(0)}%</text>
  }
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <RPieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="25%" outerRadius="68%" paddingAngle={1} labelLine={false} label={showDataLabels ? renderLabel : false}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="#0d1117" strokeWidth={1.5} />)}
        </Pie>
        <RTooltip {...R_TOOLTIP} formatter={(v, n) => [fmtNum(v), n]} />
      </RPieChart>
    </ResponsiveContainer>
  )
}

function RHistogramChart({ rows, xKey, color, showGrid, showDataLabels, labelColor, gridColor='#2a3038', yTickColor='#6e7681', xTickColor='#8b949e', fullscreen=false }) {
  if (!rows.length) return null
  const chartHeight = fullscreen ? 500 : 320
  const BINS = 12
  const vals = rows.map(r => numVal(r[xKey])).filter(v => isFinite(v))
  if (!vals.length) return null
  const minV = Math.min(...vals), maxV = Math.max(...vals, minV + 1), binW = (maxV - minV) / BINS
  const bins = Array.from({ length: BINS }, (_, i) => ({
    label: (minV + i * binW).toFixed(1),
    count: 0,
  }))
  vals.forEach(v => { const i = Math.min(Math.floor((v - minV) / binW), BINS - 1); bins[i].count++ })
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={bins} margin={{ top: 10, right: 20, bottom: 10, left: 20 }} barCategoryGap={2}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />}
        <XAxis dataKey="label" tick={{ fontSize: 8, fill: xTickColor }} interval={1} />
        <YAxis tick={{ fontSize: 9, fill: yTickColor }} />
        <RTooltip {...R_TOOLTIP} />
        <Bar dataKey="count" fill={color || '#1f6feb'} radius={[3, 3, 0, 0]}>
          {showDataLabels && <LabelList dataKey="count" position="top" style={{ fontSize: 9, fill: labelColor || yTickColor }} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function RRadarChartComp({ rows, xKey, traces, showDataLabels, showGrid, gridColor='#2a3038', xTickColor='#8b949e', fullscreen=false }) {
  if (rows.length < 3) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#6e7681', fontSize: 12 }}>Need at least 3 rows for radar chart</div>
  )
  const chartHeight = fullscreen ? 500 : 320
  const data = rows.slice(0, 12).map(r => {
    const pt = { __x: String(r[xKey] ?? '') }
    traces.forEach(tr => { pt[tr.name || tr.yKey] = numVal(r[tr.yKey]) })
    return pt
  })
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <RRadarChart data={data} cx="50%" cy="50%">
        {showGrid && <PolarGrid stroke={gridColor} />}
        <PolarAngleAxis dataKey="__x" tick={{ fontSize: 9, fill: xTickColor }} />
        <PolarRadiusAxis tick={{ fontSize: 8, fill: '#6e7681' }} />
        {traces.filter(tr => tr.yKey).map((tr, i) => (
          <Radar key={i} dataKey={tr.name || tr.yKey} stroke={tr.color} fill={hexToRgba(tr.color, 0.22)} strokeWidth={2} dot={{ r: 3, fill: tr.color, stroke: '#0d1117', strokeWidth: 1 }}>
            {(tr.showDataLabels ?? showDataLabels) && <LabelList dataKey={tr.name || tr.yKey} style={{ fontSize: 9, fill: tr.labelColor || tr.color }} formatter={fmtNum} />}
          </Radar>
        ))}
        <RTooltip {...R_TOOLTIP} formatter={(v, n) => [fmtNum(v), n]} />
      </RRadarChart>
    </ResponsiveContainer>
  )
}

function WaterfallChart({ rows, xKey, valueKey, showDataLabels, showGrid, gridColor='#2a3038', yTickColor='#6e7681', xTickColor='#8b949e', fullscreen=false }) {
  if (!rows.length) return null
  const chartHeight = fullscreen ? 500 : 320
  let running = 0
  const data = rows.map(r => {
    const v = numVal(r[valueKey])
    const base = v < 0 ? running + v : running
    running += v
    return { __x: String(r[xKey] ?? ''), base, value: Math.abs(v), actual: v, total: running }
  })
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />}
        <XAxis dataKey="__x" tick={{ fontSize: 9, fill: xTickColor }} tickFormatter={v => shortLabel(String(v ?? ''), 14)} />
        <YAxis tickFormatter={fmtNum} tick={{ fontSize: 9, fill: yTickColor }} />
        <RTooltip {...R_TOOLTIP} formatter={(v, n, props) => n === 'value' ? [fmtNum(props.payload.actual), valueKey || 'Value'] : null} />
        <Bar dataKey="base" stackId="wf" fill="transparent" stroke="none" />
        <Bar dataKey="value" stackId="wf" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.actual >= 0 ? '#3fb950' : '#f85149'} />)}
          {showDataLabels && <LabelList dataKey="actual" position="top" style={{ fontSize: 9, fill: '#8b949e' }} formatter={v => (v >= 0 ? '+' : '') + fmtNum(v)} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function FunnelChartComp({ rows, xKey, valueKey, colors, showDataLabels, fullscreen=false }) {
  if (!rows.length) return null
  const data = rows.map((r, i) => ({
    name: String(r[xKey] ?? ''),
    value: Math.abs(numVal(r[valueKey])),
    fill: colors[i % colors.length],
  })).filter(d => d.value > 0)
  return (
    <ResponsiveContainer width="100%" height={fullscreen ? 500 : 320}>
      <RFunnelChart>
        <Funnel dataKey="value" data={data} isAnimationActive={false}>
          {showDataLabels && <LabelList position="right" style={{ fontSize: 10, fill: '#8b949e' }} dataKey="name" />}
        </Funnel>
        <RTooltip {...R_TOOLTIP} formatter={(v, n) => [fmtNum(v), n]} />
      </RFunnelChart>
    </ResponsiveContainer>
  )
}

// ── Data Table ────────────────────────────────────────────────────────────────
function DataTable({ rows, columns, maxRows=12 }) {
  const [exp,setExp]=useState(false); const dr=exp?rows:rows.slice(0,maxRows)
  return(
    <div style={{overflowX:'auto',borderTop:'1px solid #21262d',marginTop:4}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:'inherit'}}>
        <thead><tr>{columns.map(c=><th key={c} style={{padding:'4px 8px',background:'#161b22',color:'#8b949e',fontWeight:700,textAlign:'left',borderBottom:'1px solid #30363d',whiteSpace:'nowrap',fontSize:9,textTransform:'uppercase',letterSpacing:'0.05em'}}>{c}</th>)}</tr></thead>
        <tbody>{dr.map((r,i)=><tr key={i} style={{background:i%2===0?'transparent':'rgba(255,255,255,0.018)'}}>{columns.map(c=><td key={c} style={{padding:'3px 8px',color:'#e6edf3',borderBottom:'1px solid #1a1f28',whiteSpace:'nowrap',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',fontSize:10}}>{r[c]===null||r[c]===undefined?<span style={{color:'#6e7681',fontStyle:'italic'}}>null</span>:String(r[c])}</td>)}</tr>)}</tbody>
      </table>
      {rows.length>maxRows&&<button onClick={()=>setExp(v=>!v)} style={{width:'100%',padding:'4px',background:'none',border:'none',color:'#6e7681',cursor:'pointer',fontSize:10,borderTop:'1px solid #21262d',fontFamily:'inherit'}}>{exp?`▲ Show less`:`▼ Show all ${rows.length} rows`}</button>}
    </div>
  )
}

// ── Summary Stats ─────────────────────────────────────────────────────────────
function SummaryStats({ rows, yKey, label, color }) {
  if (!yKey||!rows.length) return null
  const vals=rows.map(r=>numVal(r[yKey])).filter(v=>isFinite(v)); if(!vals.length) return null
  const sum=vals.reduce((s,v)=>s+v,0),avg=sum/vals.length,min=Math.min(...vals),max=Math.max(...vals)
  const sorted=[...vals].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)]
  const stats=[{l:'Count',v:vals.length},{l:'Sum',v:fmtNum(sum)},{l:'Average',v:fmtNum(avg)},{l:'Min',v:fmtNum(min)},{l:'Max',v:fmtNum(max)},{l:'Median',v:fmtNum(median)}]
  return(
    <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'5px 8px',padding:'7px 12px',borderTop:'1px solid #21262d',background:'#0a0e14'}}>
      <div style={{width:3,height:26,background:color||'#1f6feb',borderRadius:2,flexShrink:0,marginRight:4}}/>
      <span style={{fontSize:9,color:'#6e7681',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',flexShrink:0}}>{label||yKey}</span>
      {stats.map(s=><div key={s.l} style={{display:'flex',flexDirection:'column',alignItems:'center',background:'#161b22',border:'1px solid #21262d',borderRadius:4,padding:'2px 7px',minWidth:48}}><span style={{fontSize:7,color:'#6e7681',fontWeight:700,textTransform:'uppercase'}}>{s.l}</span><span style={{fontSize:11,color:'#e6edf3',fontWeight:700}}>{s.v}</span></div>)}
    </div>
  )
}

// ── Chart Type Definitions ────────────────────────────────────────────────────
const CHART_TYPES = [
  {id:'bar',      label:'Column',  icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="2" y="8" width="4" height="10" rx="1" fill="currentColor"/><rect x="8" y="4" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="6" width="4" height="12" rx="1" fill="currentColor"/></svg>},
  {id:'hbar',     label:'Bar',     icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="2" y="2" width="12" height="4" rx="1" fill="currentColor"/><rect x="2" y="8" width="16" height="4" rx="1" fill="currentColor"/><rect x="2" y="14" width="8" height="4" rx="1" fill="currentColor"/></svg>},
  {id:'stacked',  label:'Stacked', icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="2" y="12" width="4" height="6" rx="1" fill="currentColor"/><rect x="2" y="7" width="4" height="5" fill="currentColor" opacity="0.5"/><rect x="8" y="8" width="4" height="10" rx="1" fill="currentColor"/><rect x="8" y="4" width="4" height="4" fill="currentColor" opacity="0.5"/><rect x="14" y="10" width="4" height="8" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="5" fill="currentColor" opacity="0.5"/></svg>},
  {id:'stacked100',label:'100%',   icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="2" y="2" width="4" height="16" rx="1" fill="currentColor" opacity="0.35"/><rect x="2" y="9" width="4" height="9" fill="currentColor" opacity="0.85"/><rect x="8" y="2" width="4" height="16" rx="1" fill="currentColor" opacity="0.35"/><rect x="8" y="6" width="4" height="12" fill="currentColor" opacity="0.85"/><rect x="14" y="2" width="4" height="16" rx="1" fill="currentColor" opacity="0.35"/><rect x="14" y="11" width="4" height="7" fill="currentColor" opacity="0.85"/></svg>},
  {id:'line',     label:'Line',    icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><polyline points="2,16 6,8 10,12 14,5 18,9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>},
  {id:'area',     label:'Area',    icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M2 16 L6 8 L10 12 L14 5 L18 9 L18 18 L2 18 Z" fill="currentColor" opacity="0.45"/><polyline points="2,16 6,8 10,12 14,5 18,9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none"/></svg>},
  {id:'scatter',  label:'Scatter', icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><circle cx="5" cy="14" r="2" fill="currentColor"/><circle cx="9" cy="8" r="2" fill="currentColor"/><circle cx="14" cy="11" r="2" fill="currentColor"/><circle cx="17" cy="5" r="2" fill="currentColor"/></svg>},
  {id:'pie',      label:'Pie',     icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M10 10 L10 2 A8 8 0 0 1 17.66 14 Z" fill="currentColor" opacity="0.9"/><path d="M10 10 L17.66 14 A8 8 0 0 1 2.34 14 Z" fill="currentColor" opacity="0.6"/><path d="M10 10 L2.34 14 A8 8 0 0 1 10 2 Z" fill="currentColor" opacity="0.3"/></svg>},
  {id:'radar',    label:'Radar',   icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><polygon points="10,2 18,7 15,16 5,16 2,7" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2"/></svg>},
  {id:'histogram',label:'Histo',   icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="1" y="12" width="3" height="6" rx="0.5" fill="currentColor"/><rect x="5" y="7" width="3" height="11" rx="0.5" fill="currentColor"/><rect x="9" y="4" width="3" height="14" rx="0.5" fill="currentColor"/><rect x="13" y="9" width="3" height="9" rx="0.5" fill="currentColor"/><rect x="17" y="13" width="2" height="5" rx="0.5" fill="currentColor"/></svg>},
  {id:'waterfall',label:'Waterfall',icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="1" y="10" width="3" height="8" rx="0.5" fill="#3fb950"/><rect x="5" y="6" width="3" height="4" rx="0.5" fill="#3fb950"/><rect x="9" y="4" width="3" height="2" rx="0.5" fill="#3fb950"/><rect x="13" y="5" width="3" height="3" rx="0.5" fill="#f85149"/><rect x="17" y="7" width="2" height="5" rx="0.5" fill="#f85149"/><line x1="1" y1="18" x2="19" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.4"/></svg>},
  {id:'funnel',   label:'Funnel',  icon:<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M2 3 L18 3 L14 8 L14 17 L6 17 L6 8 Z" fill="currentColor" opacity="0.7" stroke="currentColor" strokeWidth="0.5" strokeLinejoin="round"/></svg>},
]

const BEVEL_TYPES = ['None','Circle','Relaxed Inset','Cross','Cool Slant','Angle','Soft Round','Convex','Slope','Divot','Riblet','Hard Edge','Art Deco']
const MATERIALS   = ['Flat','Warm Matte','Plastic','Metal','Dark Edge','Soft Edge','Clear','Powder','Translucent Powder']
const LIGHTINGS   = ['Three Point','Balanced','Soft','Harsh','Flood','Contrasting','Morning','Sunrise','Sunset','Chilly','Freezing']
const SHADOW_PRESETS = [
  {id:'none',      label:'No Shadow'},
  {id:'outer',     label:'Drop Shadow'},
  {id:'inner',     label:'Inner Shadow'},
]

// ── UI Helpers ────────────────────────────────────────────────────────────────
function Section({ title, children, defaultOpen=true, icon }) {
  const [open,setOpen]=useState(defaultOpen)
  return(
    <div style={{borderBottom:'1px solid #21262d'}}>
      <button onClick={()=>setOpen(!open)} style={{display:'flex',alignItems:'center',gap:6,width:'100%',background:'none',border:'none',padding:'8px 12px',cursor:'pointer',color:'var(--text-primary)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'inherit'}}>
        <svg viewBox="0 0 12 12" width="9" height="9" fill="currentColor" style={{transition:'transform 0.15s',transform:open?'rotate(90deg)':'rotate(0deg)',opacity:0.55}}><path d="M3 1.5l5 4.5-5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/></svg>
        {icon&&<span style={{opacity:0.7}}>{icon}</span>}
        {title}
      </button>
      {open&&<div style={{padding:'0 12px 10px'}}>{children}</div>}
    </div>
  )
}
function FR({ label, children, tip }) {
  return(
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}} title={tip}>
      <span style={{fontSize:11,color:'var(--text-muted)',minWidth:62,flexShrink:0}}>{label}</span>
      <div style={{flex:1}}>{children}</div>
    </div>
  )
}
function Sel({ value, onChange, options, placeholder }) {
  return(
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{width:'100%',background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:11,color:'var(--text-primary)',cursor:'pointer',outline:'none',fontFamily:'inherit'}}>
      {placeholder&&<option value="">{placeholder}</option>}
      {options.map(o=><option key={typeof o==='string'?o:o.value} value={typeof o==='string'?o:o.value}>{typeof o==='string'?o:o.label}</option>)}
    </select>
  )
}
function ColorDot({ color, onChange }) {
  const ref=useRef(null)
  return(
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <div onClick={()=>ref.current?.click()} style={{width:18,height:18,borderRadius:3,background:color,cursor:'pointer',border:'1px solid var(--border)',flexShrink:0}}/>
      <input ref={ref} type="color" value={color||'#000000'} onChange={e=>onChange(e.target.value)} style={{position:'absolute',opacity:0,pointerEvents:'none',width:0,height:0}}/>
      <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'monospace'}}>{color}</span>
    </div>
  )
}
function Tog({ checked, onChange, label }) {
  return(
    <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'var(--text-secondary)',userSelect:'none'}}>
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{accentColor:'var(--accent-blue)'}}/>
      {label}
    </label>
  )
}
function SliderPct({ label, value, onChange, min=0, max=100, step=1, suffix='%' }) {
  return(
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:7}}>
      {label&&<span style={{fontSize:11,color:'var(--text-muted)',minWidth:62,flexShrink:0}}>{label}</span>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} style={{flex:1,accentColor:'var(--accent-blue)'}}/>
      <input type="number" min={min} max={max} value={value} onChange={e=>onChange(Math.max(min,Math.min(max,Number(e.target.value))))}
        style={{width:38,background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:3,padding:'2px 3px',fontSize:10,color:'var(--text-primary)',outline:'none',textAlign:'right',fontFamily:'inherit'}}/>
      {suffix&&<span style={{fontSize:10,color:'var(--text-muted)',flexShrink:0}}>{suffix}</span>}
    </div>
  )
}
function NumInput({ value, onChange, min, max, placeholder, suffix, style:s }) {
  return(
    <div style={{display:'flex',alignItems:'center',gap:4,...s}}>
      <input type="number" value={value} min={min} max={max} placeholder={placeholder} onChange={e=>onChange(e.target.value===''?'':Number(e.target.value))}
        style={{flex:1,background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:11,color:'var(--text-primary)',outline:'none',fontFamily:'inherit'}}/>
      {suffix&&<span style={{fontSize:10,color:'var(--text-muted)',flexShrink:0}}>{suffix}</span>}
    </div>
  )
}
function Radio({ label, name, value, checked, onChange }) {
  return(
    <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:checked?'var(--text-primary)':'var(--text-secondary)',marginBottom:4,userSelect:'none'}}>
      <input type="radio" name={name} value={value} checked={checked} onChange={()=>onChange(value)} style={{accentColor:'var(--accent-blue)'}}/>
      {label}
    </label>
  )
}
function Legend({ traces, position='bottom', textColor='var(--text-secondary)' }) {
  if (position === 'none') return null
  const align = position === 'left' ? 'flex-start' : position === 'right' ? 'flex-end' : 'center'
  return(
    <div style={{display:'flex',flexWrap:'wrap',gap:'5px 12px',padding:'7px 0 2px',justifyContent:align}}>
      {traces.filter(t=>t.yKey||t.valueKey).map((t,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:textColor}}>
          {(t.type==='line'||t.type==='area')
            ? <div style={{width:16,height:2,borderRadius:1,background:t.color,flexShrink:0}}/>
            : <div style={{width:10,height:10,borderRadius:2,background:t.color,flexShrink:0}}/>}
          {t.name||t.yKey||`Series ${i+1}`}
        </div>
      ))}
    </div>
  )
}

// ── Default format states ─────────────────────────────────────────────────────
const DEF_FILL    = { type:'none', color:'#0d1117', transparency:0, gradAngle:135, gradStops:[{color:'#0d1117',position:0,transparency:0},{color:'#161b22',position:100,transparency:0}] }
const DEF_BORDER  = { type:'none', color:'#30363d', width:1, dash:'solid', radius:4 }
// Per-series format (applied to the drawn shapes, not the container)
const DEF_SERIES_FORMAT = { fillTransparency:0, borderType:'none', borderColor:'', borderWidth:1.5, borderDash:'solid' }
const DEF_SHADOW  = { type:'none', color:'#000000', transparency:60, blur:6, angle:45, distance:4 }
const DEF_GLOW    = { size:0, color:'#1f6feb', transparency:50 }
const DEF_SOFT    = { size:0 }
const DEF_3D      = { topBevel:{type:'None',width:6,height:6}, bottomBevel:{type:'None',width:6,height:6}, depth:{color:'#000000',size:0}, contour:{color:'#000000',size:0}, material:'Flat', lighting:'Three Point', lightAngle:45 }
const DEF_SIZE    = { widthPx:'', heightPx:'', lockAspect:false }
const DEF_VISUAL  = {
  gridColor:'#2a3038',
  axisLineColor:'#30363d',
  xTickColor:'#8b949e',
  yTickColor:'#6e7681',
  y2TickColor:'#6e7681',
  xTitleColor:'#8b949e',
  yTitleColor:'#8b949e',
  y2TitleColor:'#8b949e',
  chartTitleColor:'#e6edf3',
  legendTextColor:'#8b949e',
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main ChartView ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function ChartView({ data, onSaveChart, initialConfig, sourceSql = '' }) {
  const columns = data?.columns ?? []
  const allRows = data?.rows ?? []
  const ic = initialConfig || {}

  // ── Series / data ────────────────────────────────────────────────────────
  const [traces, setTraces] = useState(()=>ic.traces||[{
    type:'bar', xKey:columns[0]??'', yKey:columns[1]??'',
    valueKey:columns[1]??'', labelKey:columns[0]??'',
    color:PALETTE[0], name:'Series 1', secondaryAxis:false, showDataLabels: undefined, labelColor: '', dataLabelPosition: undefined, showTrendline: undefined, smoothLine: undefined, barOpacity: undefined, seriesFmt:{...DEF_SERIES_FORMAT},
  }])
  const [rowLimit, setRowLimit] = useState(()=>ic.rowLimit??100)
  const [sortBy, setSortBy] = useState(()=>ic.sortBy??'none')
  const [sortDir, setSortDir] = useState(()=>ic.sortDir??'desc')
  // ── Axes & labels ────────────────────────────────────────────────────────
  const [title, setTitle] = useState(()=>ic.title??'')
  const [xLabel, setXLabel] = useState(()=>ic.xLabel??'')
  const [yLabel, setYLabel] = useState(()=>ic.yLabel??'')
  const [yLabel2, setYLabel2] = useState(()=>ic.yLabel2??'')
  const [secondaryFormat, setSecondaryFormat] = useState(()=>ic.secondaryFormat??'auto')
  const [showLegend, setShowLegend] = useState(()=>ic.showLegend??true)
  const [legendPosition, setLegendPosition] = useState(()=>ic.legendPosition??'bottom')
  const [showGrid, setShowGrid] = useState(()=>ic.showGrid??true)
  const [showXAxis, setShowXAxis] = useState(()=>ic.showXAxis??true)
  const [showYAxis, setShowYAxis] = useState(()=>ic.showYAxis??true)
  const [showSecondaryAxis, setShowSecondaryAxis] = useState(()=>ic.showSecondaryAxis??true)
  const [showAxisTitles, setShowAxisTitles] = useState(()=>ic.showAxisTitles??false)
  const [titlePosition, setTitlePosition] = useState(()=>ic.titlePosition??'above')
  // ── Display ──────────────────────────────────────────────────────────────
  const [showDataLabels, setShowDataLabels] = useState(()=>ic.showDataLabels??false)
  const [dataLabelPosition, setDataLabelPosition] = useState(()=>ic.dataLabelPosition??'auto')
  const [showTrendline, setShowTrendline] = useState(()=>ic.showTrendline??false)
  const [smoothLine, setSmoothLine] = useState(()=>ic.smoothLine??false)
  const [showDataTable, setShowDataTable] = useState(()=>ic.showDataTable??false)
  const [showSummaryStats, setShowSummaryStats] = useState(()=>ic.showSummaryStats??false)
  const [barOpacity, setBarOpacity] = useState(()=>ic.barOpacity??85)
  // ── Format Chart Area ────────────────────────────────────────────────────
  const [chartFill,   setChartFill]   = useState(()=>ic.chartFill??{...DEF_FILL})
  const [chartBorder, setChartBorder] = useState(()=>ic.chartBorder??{...DEF_BORDER})
  const [chartShadow, setChartShadow] = useState(()=>ic.chartShadow??{...DEF_SHADOW})
  const [chartGlow,   setChartGlow]   = useState(()=>ic.chartGlow??{...DEF_GLOW})
  const [chartSoftEdge,setChartSoftEdge]=useState(()=>ic.chartSoftEdge??{...DEF_SOFT})
  const [chart3D,     setChart3D]     = useState(()=>ic.chart3D??{...DEF_3D,topBevel:{...DEF_3D.topBevel},bottomBevel:{...DEF_3D.bottomBevel},depth:{...DEF_3D.depth},contour:{...DEF_3D.contour}})
  const [chartSize,   setChartSize]   = useState(()=>ic.chartSize??{...DEF_SIZE})
  const [chartVisual, setChartVisual] = useState(()=>({ ...DEF_VISUAL, ...(ic.chartVisual || {}) }))
  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeLeft, setActiveLeft] = useState('data')
  const [fullscreen, setFullscreen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [savedMsg, setSavedMsg] = useState(false)
  const [activeTraceIdx, setActiveTraceIdx] = useState(0)
  const [activeLayoutId, setActiveLayoutId] = useState(()=>ic.activeLayoutId??'layout1')
  const [activeThemeId, setActiveThemeId] = useState(()=>ic.activeThemeId??'default')
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)
  const [showColorsMenu, setShowColorsMenu] = useState(false)
  // ── Interaction state ────────────────────────────────────────────────────
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [hoveredItem, setHoveredItem] = useState(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const chartAreaRef = useRef(null)
  const layoutMenuRef = useRef(null)
  const colorsMenuRef = useRef(null)

  const numericCols = useMemo(()=>columns.filter(c=>allRows.some(r=>!isNaN(parseFloat(r[c]))&&r[c]!==''&&r[c]!==null)),[columns,allRows])
  const t = traces[activeTraceIdx]??traces[0]
  const chartType = t?.type??'bar'

  const rows = useMemo(()=>{
    let r=allRows.slice(0,rowLimit)
    if(sortBy==='value'&&t?.yKey) r=[...r].sort((a,b)=>sortDir==='asc'?numVal(a[t.yKey])-numVal(b[t.yKey]):numVal(b[t.yKey])-numVal(a[t.yKey]))
    else if(sortBy==='label'&&t?.xKey) r=[...r].sort((a,b)=>{const sa=String(a[t.xKey]??''),sb=String(b[t.xKey]??'');return sortDir==='asc'?sa.localeCompare(sb):sb.localeCompare(sa)})
    return r
  },[allRows,rowLimit,sortBy,sortDir,t?.yKey,t?.xKey])

  const updateTrace = useCallback((idx,patch)=>setTraces(ts=>ts.map((t,i)=>i===idx?{...t,...patch}:t)),[])
  const addTrace = ()=>{const i=traces.length;setTraces(ts=>[...ts,{type:traces[0]?.type??'bar',xKey:columns[0]??'',yKey:numericCols[i%numericCols.length]??numericCols[0]??'',valueKey:numericCols[0]??'',labelKey:columns[0]??'',color:PALETTE[i%PALETTE.length],name:`Series ${i+1}`,secondaryAxis:false,showDataLabels:undefined,labelColor:'',dataLabelPosition:undefined,showTrendline:undefined,smoothLine:undefined,barOpacity:undefined,seriesFmt:{...DEF_SERIES_FORMAT}}]);setActiveTraceIdx(i)}
  const removeTrace = idx=>{if(traces.length<=1) return;setTraces(ts=>ts.filter((_,i)=>i!==idx));setActiveTraceIdx(0);setSelectedSeries(null)}
  const updateSeriesFmt = useCallback((idx,patch)=>setTraces(ts=>ts.map((t,i)=>i===idx?{...t,seriesFmt:{...(t.seriesFmt||DEF_SERIES_FORMAT),...patch}}:t)),[])
  const handleSeriesClick = useCallback((trIdx)=>{
    setSelectedSeries(prev=>prev===trIdx?null:trIdx)
    setActiveTraceIdx(trIdx)
    if(trIdx!==null) setActiveLeft('format')
  },[])

  const applyQuickLayout = useCallback((layoutId)=>{
    const selected = QUICK_LAYOUTS.find(l=>l.id===layoutId)
    if (!selected) return
    setActiveLayoutId(layoutId)
    setTitlePosition(selected.titlePosition)
    setLegendPosition(selected.legendPosition)
    setShowLegend(selected.legendPosition !== 'none')
    setShowDataLabels(selected.showDataLabels)
    setShowDataTable(selected.showDataTable)
    setShowAxisTitles(selected.showAxisTitles)
    setShowGrid(true)
    setShowXAxis(true)
    setShowYAxis(true)
    setShowSecondaryAxis(true)
    if (selected.showAxisTitles) {
      if (!xLabel) setXLabel(t?.xKey || columns[0] || 'X Axis')
      if (!yLabel) setYLabel(t?.yKey || numericCols[0] || 'Y Axis')
    }
  },[columns, numericCols, t?.xKey, t?.yKey, xLabel, yLabel])

  const applyTheme = useCallback((themeId, colors)=>{
    const seriesPalette = buildSeriesPalette(colors)
    setTraces(ts => ts.map((trace, index) => ({ ...trace, color: seriesPalette[index % seriesPalette.length] })))
    setActiveThemeId(themeId)
  },[])

  useEffect(() => {
    const onDocClick = (event) => {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(event.target)) setShowLayoutMenu(false)
      if (colorsMenuRef.current && !colorsMenuRef.current.contains(event.target)) setShowColorsMenu(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  },[])

  // ── Export ────────────────────────────────────────────────────────────────
  const exportSVG = useCallback(()=>{
    const svgEl=chartAreaRef.current?.querySelector('svg'); if(!svgEl) return
    const blob=new Blob([new XMLSerializer().serializeToString(svgEl)],{type:'image/svg+xml'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(title||'chart')+'.svg';a.click();URL.revokeObjectURL(a.href)
  },[title])
  const exportPNG = useCallback(()=>{
    const svgEl=chartAreaRef.current?.querySelector('svg'); if(!svgEl) return
    const vb=svgEl.viewBox.baseVal,svgW=vb.width||580,svgH=vb.height||280
    const svgStr=new XMLSerializer().serializeToString(svgEl.cloneNode(true))
      .replace(/var\(--border\)/g,'#30363d').replace(/var\(--text-primary\)/g,'#e6edf3')
      .replace(/var\(--text-secondary\)/g,'#8b949e').replace(/var\(--text-muted\)/g,'#6e7681')
      .replace(/var\(--bg-panel\)/g,'#0d1117').replace(/currentColor/g,'#8b949e')
    const scale=2,canvas=document.createElement('canvas');canvas.width=svgW*scale;canvas.height=svgH*scale
    const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle=chartFill.color||'#0d1117';ctx.fillRect(0,0,svgW,svgH)
    const img=new Image();img.onload=()=>{ctx.drawImage(img,0,0);const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=(title||'chart')+'.png';a.click()}
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr)
  },[chartFill,title])

  // ── Detect chart mode ────────────────────────────────────────────────────
  const isStandalone = ['pie','radar','histogram','stacked','stacked100','waterfall','funnel'].includes(chartType)
  const selectedTrace = selectedSeries!==null ? traces[selectedSeries] : null
  // ── Render chart ──────────────────────────────────────────────────────────
  const renderChart = ()=>{
    if(!mounted) return <div style={{textAlign:'center',padding:'60px 0',color:'var(--text-muted)',fontSize:12}}>Loading chart…</div>
    if(!rows.length) return <div style={{textAlign:'center',padding:'60px 0',color:'var(--text-muted)',fontSize:12}}>No data to display</div>
    if(chartType==='pie') return <RPieChartComp rows={rows} labelKey={t.labelKey||columns[0]||''} valueKey={t.valueKey||numericCols[0]||''} colors={buildSeriesPalette(traces.map(tr=>tr.color))} showDataLabels={t.showDataLabels ?? showDataLabels} fullscreen={fullscreen}/>
    if(chartType==='histogram') return <RHistogramChart rows={rows} xKey={t.xKey||numericCols[0]||''} color={t.color} showGrid={showGrid&&showYAxis} showDataLabels={t.showDataLabels ?? showDataLabels} labelColor={t.labelColor||t.color} gridColor={chartVisual.gridColor} yTickColor={chartVisual.yTickColor} xTickColor={chartVisual.xTickColor} fullscreen={fullscreen}/>
    if(chartType==='radar') return <RRadarChartComp rows={rows} xKey={t.xKey||columns[0]||''} traces={traces} showDataLabels={showDataLabels} showGrid={showGrid} gridColor={chartVisual.gridColor} xTickColor={chartVisual.xTickColor} fullscreen={fullscreen}/>
    if(chartType==='stacked'||chartType==='stacked100') return <RStackedBarChart rows={rows} traces={traces.filter(tr=>tr.yKey)} xKey={t.xKey||columns[0]||''} normalized={chartType==='stacked100'} showDataLabels={showDataLabels} showGrid={showGrid&&showYAxis} gridColor={chartVisual.gridColor} yTickColor={chartVisual.yTickColor} xTickColor={chartVisual.xTickColor} barOpacity={barOpacity} fullscreen={fullscreen}/>
    if(chartType==='waterfall') return <WaterfallChart rows={rows} xKey={t.xKey||columns[0]||''} valueKey={t.yKey||numericCols[0]||''} showDataLabels={t.showDataLabels ?? showDataLabels} showGrid={showGrid&&showYAxis} gridColor={chartVisual.gridColor} yTickColor={chartVisual.yTickColor} xTickColor={chartVisual.xTickColor} fullscreen={fullscreen}/>
    if(chartType==='funnel') return <FunnelChartComp rows={rows} xKey={t.xKey||t.labelKey||columns[0]||''} valueKey={t.yKey||t.valueKey||numericCols[0]||''} colors={buildSeriesPalette(traces.map(tr=>tr.color))} showDataLabels={t.showDataLabels ?? showDataLabels} fullscreen={fullscreen}/>
    return <RComboChart rows={rows} traces={traces} xKey={t.xKey||columns[0]||''} showDataLabels={showDataLabels} showGrid={showGrid&&showYAxis} trendline={showTrendline} smooth={smoothLine} xLabel={xLabel} yLabel={yLabel} yLabel2={yLabel2} secondaryFormat={secondaryFormat} barOpacity={barOpacity} showXAxis={showXAxis} showYAxis={showYAxis} showSecondaryAxis={showSecondaryAxis} showAxisTitles={showAxisTitles} visual={chartVisual} fullscreen={fullscreen}/>
  }

  const handleSave = ()=>{
    const name=saveName.trim()||(title||`Chart ${Date.now()}`)
    saveChart({name,config:{traces,rowLimit,title,titlePosition,showLegend,legendPosition,showGrid,showXAxis,showYAxis,showSecondaryAxis,showAxisTitles,dataLabelPosition,activeLayoutId,activeThemeId,barOpacity,xLabel,yLabel,yLabel2,secondaryFormat,showDataLabels,showTrendline,smoothLine,showDataTable,showSummaryStats,sortBy,sortDir,chartFill,chartBorder,chartShadow,chartGlow,chartSoftEdge,chart3D,chartSize,chartVisual},dataSnapshot:{columns,rows:allRows.slice(0,200)},sourceSql})
    setSaveModalOpen(false);setSavedMsg(true);setTimeout(()=>setSavedMsg(false),2500)
    if(onSaveChart) onSaveChart()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ── LEFT PANEL ────────────────────────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════
  const TABS = [['data','Data'],['format','Format'],['style','Style']]
  const leftPanel = (
    <div style={{width:236,flexShrink:0,background:'var(--bg-secondary)',borderRight:'1px solid var(--border)',overflowY:'auto',display:'flex',flexDirection:'column',fontSize:12}}>
      <div style={{display:'flex',borderBottom:'1px solid var(--border)',flexShrink:0}}>
        {TABS.map(([id,lbl])=>(
          <button key={id} onClick={()=>setActiveLeft(id)}
            style={{flex:1,padding:'7px 0',background:'none',border:'none',borderBottom:activeLeft===id?'2px solid var(--accent-blue)':'2px solid transparent',cursor:'pointer',fontSize:9,fontWeight:700,color:activeLeft===id?'var(--accent-blue)':'var(--text-muted)',fontFamily:'inherit',letterSpacing:'0.05em',textTransform:'uppercase'}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ──────────────────── DATA TAB ──────────────────── */}
      {activeLeft==='data'&&<>
        {/* Series list */}
        <div style={{padding:'8px 10px 4px',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',marginBottom:6}}>
            <span style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',flex:1}}>Series</span>
            <button onClick={addTrace} style={{background:'none',border:'1px solid var(--border)',borderRadius:3,color:'var(--text-muted)',cursor:'pointer',fontSize:11,padding:'1px 8px',fontFamily:'inherit'}}>+ Add</button>
          </div>
          {traces.map((tr,i)=>(
            <div key={i} onClick={()=>setActiveTraceIdx(i)}
              style={{display:'flex',alignItems:'center',gap:6,padding:'5px 6px',borderRadius:4,marginBottom:3,cursor:'pointer',background:activeTraceIdx===i?'var(--bg-panel)':'transparent',border:`1px solid ${activeTraceIdx===i?'var(--border)':'transparent'}`}}>
              <div style={{width:10,height:10,borderRadius:2,background:tr.color,flexShrink:0}}/>
              <div style={{flex:1,overflow:'hidden'}}>
                <div style={{fontSize:11,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tr.name}</div>
                <div style={{fontSize:9,color:'var(--text-muted)',marginTop:1}}>{tr.type||'bar'}{tr.secondaryAxis?' · 2nd axis':''}</div>
              </div>
              {traces.length>1&&<button onClick={e=>{e.stopPropagation();removeTrace(i)}} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:14,lineHeight:1,padding:'0 2px'}}>×</button>}
            </div>
          ))}
        </div>

        {/* Active series config */}
        {t&&<div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>
            Series {activeTraceIdx+1} Format
          </div>
          {/* Per-series chart type selector */}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:5,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>Chart Type</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:3}}>
              {CHART_TYPES.map(ct=>(
                <button key={ct.id} title={ct.label} onClick={()=>updateTrace(activeTraceIdx,{type:ct.id})}
                  style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'4px 2px',background:t.type===ct.id?'rgba(31,111,235,0.18)':'var(--bg-tertiary)',border:`1px solid ${t.type===ct.id?'var(--accent-blue)':'var(--border)'}`,borderRadius:5,cursor:'pointer',color:t.type===ct.id?'var(--accent-blue)':'var(--text-muted)'}}>
                  {ct.icon}<span style={{fontSize:7,textAlign:'center',lineHeight:1}}>{ct.label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Series name */}
          <input value={t.name} onChange={e=>updateTrace(activeTraceIdx,{name:e.target.value})} placeholder="Series name"
            style={{width:'100%',background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:11,color:'var(--text-primary)',outline:'none',marginBottom:8,boxSizing:'border-box',fontFamily:'inherit'}}/>
          {/* Axis mapping */}
          {t.type==='pie'?(<>
            <FR label="Values"><Sel value={t.valueKey} onChange={v=>updateTrace(activeTraceIdx,{valueKey:v})} options={numericCols} placeholder="— column —"/></FR>
            <FR label="Labels"><Sel value={t.labelKey} onChange={v=>updateTrace(activeTraceIdx,{labelKey:v})} options={columns} placeholder="— column —"/></FR>
          </>):t.type==='histogram'?(<>
            <FR label="Values"><Sel value={t.xKey} onChange={v=>updateTrace(activeTraceIdx,{xKey:v})} options={numericCols} placeholder="— column —"/></FR>
          </>):(<>
            <FR label="X Axis"><Sel value={t.xKey} onChange={v=>updateTrace(activeTraceIdx,{xKey:v})} options={columns} placeholder="— column —"/></FR>
            <FR label="Y Axis"><Sel value={t.yKey} onChange={v=>updateTrace(activeTraceIdx,{yKey:v})} options={numericCols} placeholder="— column —"/></FR>
          </>)}
          {/* Color */}
          <FR label="Color"><ColorDot color={t.color} onChange={c=>updateTrace(activeTraceIdx,{color:c})}/></FR>
          <FR label="Labels">
            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <Tog checked={t.showDataLabels ?? showDataLabels} onChange={v=>updateTrace(activeTraceIdx,{showDataLabels:v})} label="Show labels"/>
              <button onClick={()=>updateTrace(activeTraceIdx,{showDataLabels:undefined})} style={{padding:'2px 6px',background:'none',border:'1px solid var(--border)',borderRadius:4,color:'var(--text-muted)',fontSize:10,cursor:'pointer',fontFamily:'inherit'}}>Global</button>
            </div>
          </FR>
          <FR label="Lbl Pos">
            <Sel
              value={t.dataLabelPosition ?? 'inherit'}
              onChange={v=>updateTrace(activeTraceIdx,{dataLabelPosition:v==='inherit'?undefined:v})}
              options={[
                {value:'inherit',label:'Inherit (global)'},
                {value:'none',label:'None'},
                {value:'auto',label:'Best Fit'},
                {value:'center',label:'Center'},
                {value:'insideEnd',label:'Inside End'},
                {value:'outsideEnd',label:'Outside End'},
              ]}
            />
          </FR>
          <FR label="Lbl Color">
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <ColorDot color={t.labelColor||t.color||'#1f6feb'} onChange={c=>updateTrace(activeTraceIdx,{labelColor:c})}/>
              <button onClick={()=>updateTrace(activeTraceIdx,{labelColor:''})} style={{padding:'2px 6px',background:'none',border:'1px solid var(--border)',borderRadius:4,color:'var(--text-muted)',fontSize:10,cursor:'pointer',fontFamily:'inherit'}}>Auto</button>
            </div>
          </FR>
          {/* Secondary axis option (for combo line-on-bar charts) */}
          {!['pie','radar','histogram','stacked','stacked100'].includes(t.type||'bar')&&(
            <FR label="Axis">
              <Tog checked={!!t.secondaryAxis} onChange={v=>updateTrace(activeTraceIdx,{secondaryAxis:v})} label="Secondary axis (right)"/>
            </FR>
          )}
        </div>}

        {/* Sort */}
        <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Sort Data</div>
          <FR label="Sort by"><Sel value={sortBy} onChange={setSortBy} options={[{value:'none',label:'— original order —'},{value:'value',label:'By value (Y)'},{value:'label',label:'By label (X)'}]}/></FR>
          <FR label="Direction"><Sel value={sortDir} onChange={setSortDir} options={[{value:'desc',label:'Descending ↓'},{value:'asc',label:'Ascending ↑'}]}/></FR>
        </div>

        {/* Row limit */}
        <div style={{padding:'8px 10px'}}>
          <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Row Limit: {rowLimit}</div>
          <input type="range" min={10} max={Math.min(allRows.length||500,2000)} step={10} value={rowLimit} onChange={e=>setRowLimit(Number(e.target.value))} style={{width:'100%',accentColor:'var(--accent-blue)'}}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--text-muted)',marginTop:2}}><span>10</span><span>{allRows.length} total</span></div>
        </div>
      </>}

      {/* ──────────────────── FORMAT TAB (Excel-like Format Chart Area) ──────────────────── */}
      {activeLeft==='format'&&<>
        <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',background:selectedTrace?'rgba(31,111,235,0.08)':'transparent'}}>
          <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>
            {selectedTrace ? 'Series Formatting' : 'Chart Area Formatting'}
          </div>
          <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.45}}>
            {selectedTrace
              ? `Double-click selected: ${selectedTrace.name||selectedTrace.yKey||`Series ${selectedSeries+1}`}. Changes below affect only that visual series.`
              : 'Click empty chart space to format the whole chart container. Double-click a bar, line, marker, or pie slice to format only that series.'}
          </div>
          {selectedTrace&&<button onClick={()=>setSelectedSeries(null)} style={{marginTop:8,padding:'4px 8px',background:'none',border:'1px solid var(--border)',borderRadius:4,color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Back to Chart Area</button>}
        </div>

        {selectedTrace ? <>
          <Section title="Fill">
            <SliderPct label="Transparency" value={selectedTrace.seriesFmt?.fillTransparency||0} onChange={v=>updateSeriesFmt(selectedSeries,{fillTransparency:v})}/>
          </Section>

          <Section title="Border">
            {['none','solid'].map(tp=><Radio key={tp} label={tp==='none'?'No line':'Solid line'} name="series-border-type" value={tp} checked={(selectedTrace.seriesFmt?.borderType||'none')===tp} onChange={v=>updateSeriesFmt(selectedSeries,{borderType:v})}/>) }
            {(selectedTrace.seriesFmt?.borderType||'none')==='solid'&&<>
              <FR label="Color"><ColorDot color={selectedTrace.seriesFmt?.borderColor||selectedTrace.color||'#30363d'} onChange={c=>updateSeriesFmt(selectedSeries,{borderColor:c})}/></FR>
              <SliderPct label="Width" value={selectedTrace.seriesFmt?.borderWidth||1.5} onChange={v=>updateSeriesFmt(selectedSeries,{borderWidth:v})} min={0.5} max={10} step={0.5} suffix="px"/>
              <FR label="Dash"><Sel value={selectedTrace.seriesFmt?.borderDash||'solid'} onChange={v=>updateSeriesFmt(selectedSeries,{borderDash:v})} options={['solid','dash','dot']}/></FR>
            </>}
          </Section>

          <Section title="Series Color" defaultOpen={false}>
            <FR label="Color"><ColorDot color={selectedTrace.color} onChange={c=>updateTrace(selectedSeries,{color:c})}/></FR>
            <FR label="Labels"><ColorDot color={selectedTrace.labelColor||selectedTrace.color||'#1f6feb'} onChange={c=>updateTrace(selectedSeries,{labelColor:c})}/></FR>
          </Section>
        </> : <>
          <Section title="Fill">
            {['none','solid','gradient'].map(tp=><Radio key={tp} label={tp==='none'?'No fill':tp==='solid'?'Solid fill':'Gradient fill'} name="fill-type" value={tp} checked={chartFill.type===tp} onChange={v=>setChartFill(f=>({...f,type:v}))}/>) }
            {chartFill.type==='solid'&&<>
              <FR label="Color"><ColorDot color={chartFill.color} onChange={c=>setChartFill(f=>({...f,color:c}))}/></FR>
              <SliderPct label="Transparency" value={chartFill.transparency} onChange={v=>setChartFill(f=>({...f,transparency:v}))}/>
            </>}
            {chartFill.type==='gradient'&&<>
              <FR label="Angle"><div style={{display:'flex',alignItems:'center',gap:4}}><input type="range" min={0} max={360} value={chartFill.gradAngle||135} onChange={e=>setChartFill(f=>({...f,gradAngle:Number(e.target.value)}))} style={{flex:1,accentColor:'var(--accent-blue)'}}/><span style={{fontSize:10,color:'var(--text-muted)',minWidth:32}}>{chartFill.gradAngle||135}°</span></div></FR>
              {(chartFill.gradStops||[]).map((s,i)=><div key={i} style={{background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:4,padding:'6px 8px',marginBottom:4}}>
                <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,marginBottom:5}}>Stop {i+1} ({s.position}%)</div>
                <FR label="Color"><ColorDot color={s.color} onChange={c=>setChartFill(f=>({...f,gradStops:f.gradStops.map((g,j)=>j===i?{...g,color:c}:g)}))}/></FR>
                <SliderPct label="Transparency" value={s.transparency||0} onChange={v=>setChartFill(f=>({...f,gradStops:f.gradStops.map((g,j)=>j===i?{...g,transparency:v}:g)}))}/>
                <input type="range" min={0} max={100} value={s.position} onChange={e=>setChartFill(f=>({...f,gradStops:f.gradStops.map((g,j)=>j===i?{...g,position:Number(e.target.value)}:g)}))} style={{width:'100%',accentColor:'var(--accent-blue)'}}/>
              </div>)}
            </>}
          </Section>

          <Section title="Border">
            {['none','solid'].map(tp=><Radio key={tp} label={tp==='none'?'No line':'Solid line'} name="border-type" value={tp} checked={chartBorder.type===tp} onChange={v=>setChartBorder(b=>({...b,type:v}))}/>) }
            {chartBorder.type==='solid'&&<>
              <FR label="Color"><ColorDot color={chartBorder.color} onChange={c=>setChartBorder(b=>({...b,color:c}))}/></FR>
              <SliderPct label="Width" value={chartBorder.width||1} onChange={v=>setChartBorder(b=>({...b,width:v}))} min={0.5} max={10} step={0.5} suffix="px"/>
              <FR label="Dash"><Sel value={chartBorder.dash||'solid'} onChange={v=>setChartBorder(b=>({...b,dash:v}))} options={['solid','dash','dot','dashDot','dashDotDot']}/></FR>
              <SliderPct label="Rounded" value={chartBorder.radius||0} onChange={v=>setChartBorder(b=>({...b,radius:v}))} min={0} max={24} suffix="px"/>
            </>}
          </Section>

          <Section title="Shadow">
            <FR label="Preset">
              <Sel value={chartShadow.type||'none'} onChange={v=>setChartShadow(s=>({...s,type:v}))} options={SHADOW_PRESETS.map(p=>({value:p.id,label:p.label}))}/>
            </FR>
            {chartShadow.type!=='none'&&<>
              <FR label="Color"><ColorDot color={chartShadow.color||'#000000'} onChange={c=>setChartShadow(s=>({...s,color:c}))}/></FR>
              <SliderPct label="Transparency" value={chartShadow.transparency??60} onChange={v=>setChartShadow(s=>({...s,transparency:v}))}/>
              <SliderPct label="Blur" value={chartShadow.blur||6} onChange={v=>setChartShadow(s=>({...s,blur:v}))} min={0} max={30} suffix="pt"/>
              <SliderPct label="Angle" value={chartShadow.angle||45} onChange={v=>setChartShadow(s=>({...s,angle:v}))} min={0} max={360} suffix="°"/>
              <SliderPct label="Distance" value={chartShadow.distance||4} onChange={v=>setChartShadow(s=>({...s,distance:v}))} min={0} max={30} suffix="pt"/>
            </>}
          </Section>

          <Section title="Glow" defaultOpen={false}>
            <SliderPct label="Size" value={chartGlow.size||0} onChange={v=>setChartGlow(g=>({...g,size:v}))} min={0} max={40} suffix="pt"/>
            {(chartGlow.size||0)>0&&<>
              <FR label="Color"><ColorDot color={chartGlow.color||'#1f6feb'} onChange={c=>setChartGlow(g=>({...g,color:c}))}/></FR>
              <SliderPct label="Transparency" value={chartGlow.transparency??50} onChange={v=>setChartGlow(g=>({...g,transparency:v}))}/>
            </>}
          </Section>

          <Section title="Soft Edges" defaultOpen={false}>
            <SliderPct label="Size" value={chartSoftEdge.size||0} onChange={v=>setChartSoftEdge(s=>({...s,size:v}))} min={0} max={40} suffix="pt"/>
          </Section>

          <Section title="3-D Format" defaultOpen={false}>
            <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Top Bevel</div>
            <FR label="Type"><Sel value={chart3D.topBevel.type} onChange={v=>setChart3D(d=>({...d,topBevel:{...d.topBevel,type:v}}))} options={BEVEL_TYPES}/></FR>
            {chart3D.topBevel.type!=='None'&&<>
              <SliderPct label="Width" value={chart3D.topBevel.width||6} onChange={v=>setChart3D(d=>({...d,topBevel:{...d.topBevel,width:v}}))} min={0} max={20} suffix="pt"/>
              <SliderPct label="Height" value={chart3D.topBevel.height||6} onChange={v=>setChart3D(d=>({...d,topBevel:{...d.topBevel,height:v}}))} min={0} max={20} suffix="pt"/>
            </>}
            <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6,marginTop:8}}>Bottom Bevel</div>
            <FR label="Type"><Sel value={chart3D.bottomBevel.type} onChange={v=>setChart3D(d=>({...d,bottomBevel:{...d.bottomBevel,type:v}}))} options={BEVEL_TYPES}/></FR>
            {chart3D.bottomBevel.type!=='None'&&<>
              <SliderPct label="Width" value={chart3D.bottomBevel.width||6} onChange={v=>setChart3D(d=>({...d,bottomBevel:{...d.bottomBevel,width:v}}))} min={0} max={20} suffix="pt"/>
              <SliderPct label="Height" value={chart3D.bottomBevel.height||6} onChange={v=>setChart3D(d=>({...d,bottomBevel:{...d.bottomBevel,height:v}}))} min={0} max={20} suffix="pt"/>
            </>}
            <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6,marginTop:8}}>Depth</div>
            <FR label="Color"><ColorDot color={chart3D.depth.color||'#000000'} onChange={c=>setChart3D(d=>({...d,depth:{...d.depth,color:c}}))}/></FR>
            <SliderPct label="Size" value={chart3D.depth.size||0} onChange={v=>setChart3D(d=>({...d,depth:{...d.depth,size:v}}))} min={0} max={50} suffix="pt"/>
            <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6,marginTop:8}}>Contour</div>
            <FR label="Color"><ColorDot color={chart3D.contour.color||'#000000'} onChange={c=>setChart3D(d=>({...d,contour:{...d.contour,color:c}}))}/></FR>
            <SliderPct label="Size" value={chart3D.contour.size||0} onChange={v=>setChart3D(d=>({...d,contour:{...d.contour,size:v}}))} min={0} max={20} suffix="pt"/>
            <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6,marginTop:8}}>Surface</div>
            <FR label="Material"><Sel value={chart3D.material||'Flat'} onChange={v=>setChart3D(d=>({...d,material:v}))} options={MATERIALS}/></FR>
            <FR label="Lighting"><Sel value={chart3D.lighting||'Three Point'} onChange={v=>setChart3D(d=>({...d,lighting:v}))} options={LIGHTINGS}/></FR>
            <SliderPct label="Light angle" value={chart3D.lightAngle||45} onChange={v=>setChart3D(d=>({...d,lightAngle:v}))} min={0} max={360} suffix="°"/>
          </Section>

          <Section title="Size & Properties" defaultOpen={false}>
            <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Size</div>
            <FR label="Height"><NumInput value={chartSize.heightPx} onChange={v=>setChartSize(s=>({...s,heightPx:v}))} min={100} max={1200} placeholder="auto" suffix="px"/></FR>
            <FR label="Width"><NumInput value={chartSize.widthPx} onChange={v=>setChartSize(s=>({...s,widthPx:v}))} min={200} max={2400} placeholder="auto" suffix="px"/></FR>
            <FR label="Lock"><Tog checked={!!chartSize.lockAspect} onChange={v=>setChartSize(s=>({...s,lockAspect:v}))} label="Lock aspect ratio"/></FR>
            <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8,marginTop:10}}>Properties</div>
            <button onClick={()=>{setChartFill({...DEF_FILL});setChartBorder({...DEF_BORDER});setChartShadow({...DEF_SHADOW});setChartGlow({...DEF_GLOW});setChartSoftEdge({...DEF_SOFT});setChart3D({...DEF_3D,topBevel:{...DEF_3D.topBevel},bottomBevel:{...DEF_3D.bottomBevel},depth:{...DEF_3D.depth},contour:{...DEF_3D.contour}});setChartSize({...DEF_SIZE})}}
              style={{width:'100%',padding:'5px 8px',background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:4,color:'var(--text-secondary)',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
              Reset All Formatting
            </button>
          </Section>
        </>}
      </>}

      {/* ──────────────────── STYLE TAB ──────────────────── */}
      {activeLeft==='style'&&<>
        <Section title={selectedTrace ? 'Selected Series' : 'Chart Elements'}>
          {selectedTrace ? <>
            <FR label="Labels"><Tog checked={selectedTrace.showDataLabels ?? showDataLabels} onChange={v=>updateTrace(selectedSeries,{showDataLabels:v})} label="Show labels"/></FR>
            <FR label="Lbl Pos"><Sel value={selectedTrace.dataLabelPosition ?? 'inherit'} onChange={v=>updateTrace(selectedSeries,{dataLabelPosition:v==='inherit'?undefined:v})} options={[{value:'inherit',label:'Inherit (global)'},{value:'none',label:'None'},{value:'auto',label:'Best Fit'},{value:'center',label:'Center'},{value:'insideEnd',label:'Inside End'},{value:'outsideEnd',label:'Outside End'}]}/></FR>
            {['line','area','scatter'].includes(selectedTrace.type||'bar')&&<>
              <FR label="Trendline"><Tog checked={selectedTrace.showTrendline ?? showTrendline} onChange={v=>updateTrace(selectedSeries,{showTrendline:v})} label="Linear trendline"/></FR>
              <FR label="Smooth"><Tog checked={selectedTrace.smoothLine ?? smoothLine} onChange={v=>updateTrace(selectedSeries,{smoothLine:v})} label="Smooth line"/></FR>
            </>}
            {['bar','stacked','stacked100'].includes(selectedTrace.type||'bar')&&<SliderPct label="Opacity" value={selectedTrace.barOpacity ?? barOpacity} onChange={v=>updateTrace(selectedSeries,{barOpacity:v})}/>} 
          </> : <>
            <FR label="Axes X"><Tog checked={showXAxis} onChange={setShowXAxis} label="Primary horizontal"/></FR>
            <FR label="Axes Y"><Tog checked={showYAxis} onChange={setShowYAxis} label="Primary vertical"/></FR>
            <FR label="2nd Axis"><Tog checked={showSecondaryAxis} onChange={setShowSecondaryAxis} label="Secondary vertical"/></FR>
            <FR label="Axis Titles"><Tog checked={showAxisTitles} onChange={setShowAxisTitles} label="Show axis titles"/></FR>
            <FR label="Title Pos"><Sel value={titlePosition} onChange={setTitlePosition} options={[{value:'none',label:'None'},{value:'above',label:'Above Chart'},{value:'overlay',label:'Centered Overlay'}]}/></FR>
            <FR label="Labels"><Tog checked={showDataLabels} onChange={setShowDataLabels} label="Show labels"/></FR>
            <FR label="Lbl Pos"><Sel value={dataLabelPosition} onChange={setDataLabelPosition} options={[{value:'none',label:'None'},{value:'auto',label:'Best Fit'},{value:'center',label:'Center'},{value:'insideEnd',label:'Inside End'},{value:'outsideEnd',label:'Outside End'}]}/></FR>
            <FR label="Legend"><Sel value={legendPosition} onChange={(v)=>{setLegendPosition(v);setShowLegend(v!=='none')}} options={[{value:'none',label:'None'},{value:'right',label:'Right'},{value:'top',label:'Top'},{value:'left',label:'Left'},{value:'bottom',label:'Bottom'}]}/></FR>
            <FR label="Data Table"><Tog checked={showDataTable} onChange={setShowDataTable} label="Show"/></FR>
          </>}
        </Section>
        <Section title="Chart Title">
          <FR label="Title">
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Chart title…"
              style={{width:'100%',background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:11,color:'var(--text-primary)',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
          </FR>
        </Section>
        <Section title="Axis Text">
          <FR label="X Label"><input value={xLabel} onChange={e=>setXLabel(e.target.value)} placeholder="X axis…" style={{width:'100%',background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:11,color:'var(--text-primary)',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/></FR>
          <FR label="Y Label"><input value={yLabel} onChange={e=>setYLabel(e.target.value)} placeholder="Left axis…" style={{width:'100%',background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:11,color:'var(--text-primary)',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/></FR>
          <FR label="2nd Axis"><input value={yLabel2} onChange={e=>setYLabel2(e.target.value)} placeholder="Right axis…" style={{width:'100%',background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:11,color:'var(--text-primary)',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/></FR>
          <FR label="2nd Fmt"><Sel value={secondaryFormat} onChange={setSecondaryFormat} options={[{value:'auto',label:'Auto'},{value:'number',label:'Number'},{value:'percent',label:'Percentage %'}]}/></FR>
          <FR label="Grid"><Tog checked={showGrid} onChange={setShowGrid} label="Show grid lines"/></FR>
        </Section>
        <Section title="Text & Grid Colors" defaultOpen={false}>
          <FR label="Chart Title"><ColorDot color={chartVisual.chartTitleColor} onChange={c=>setChartVisual(v=>({...v,chartTitleColor:c}))}/></FR>
          <FR label="Legend"><ColorDot color={chartVisual.legendTextColor} onChange={c=>setChartVisual(v=>({...v,legendTextColor:c}))}/></FR>
          <FR label="Grid"><ColorDot color={chartVisual.gridColor} onChange={c=>setChartVisual(v=>({...v,gridColor:c}))}/></FR>
          <FR label="Axis Line"><ColorDot color={chartVisual.axisLineColor} onChange={c=>setChartVisual(v=>({...v,axisLineColor:c}))}/></FR>
          <FR label="X Tick"><ColorDot color={chartVisual.xTickColor} onChange={c=>setChartVisual(v=>({...v,xTickColor:c}))}/></FR>
          <FR label="Y Tick"><ColorDot color={chartVisual.yTickColor} onChange={c=>setChartVisual(v=>({...v,yTickColor:c}))}/></FR>
          <FR label="Y2 Tick"><ColorDot color={chartVisual.y2TickColor} onChange={c=>setChartVisual(v=>({...v,y2TickColor:c}))}/></FR>
          <FR label="X Title"><ColorDot color={chartVisual.xTitleColor} onChange={c=>setChartVisual(v=>({...v,xTitleColor:c}))}/></FR>
          <FR label="Y Title"><ColorDot color={chartVisual.yTitleColor} onChange={c=>setChartVisual(v=>({...v,yTitleColor:c}))}/></FR>
          <FR label="Y2 Title"><ColorDot color={chartVisual.y2TitleColor} onChange={c=>setChartVisual(v=>({...v,y2TitleColor:c}))}/></FR>
        </Section>
        <Section title="Lines">
          <FR label="Trendline"><Tog checked={selectedTrace&&['line','area','scatter'].includes(selectedTrace.type||'bar') ? (selectedTrace.showTrendline ?? showTrendline) : showTrendline} onChange={v=>selectedTrace&&['line','area','scatter'].includes(selectedTrace.type||'bar') ? updateTrace(selectedSeries,{showTrendline:v}) : setShowTrendline(v)} label={selectedTrace?'Selected series':'Linear trendline'}/></FR>
          <FR label="Smooth"><Tog checked={selectedTrace&&['line','area','scatter'].includes(selectedTrace.type||'bar') ? (selectedTrace.smoothLine ?? smoothLine) : smoothLine} onChange={v=>selectedTrace&&['line','area','scatter'].includes(selectedTrace.type||'bar') ? updateTrace(selectedSeries,{smoothLine:v}) : setSmoothLine(v)} label={selectedTrace?'Selected series':'Smooth line curves'}/></FR>
        </Section>
        <Section title="Extra">
          <FR label="Stat bar"><Tog checked={showSummaryStats} onChange={setShowSummaryStats} label="Statistics bar"/></FR>
        </Section>
        <Section title="Bars">
          <SliderPct label="Opacity" value={selectedTrace&&['bar','stacked','stacked100'].includes(selectedTrace.type||'bar') ? (selectedTrace.barOpacity ?? barOpacity) : barOpacity} onChange={v=>selectedTrace&&['bar','stacked','stacked100'].includes(selectedTrace.type||'bar') ? updateTrace(selectedSeries,{barOpacity:v}) : setBarOpacity(v)}/>
        </Section>
        <Section title="Series Colors" defaultOpen={false}>
          {traces.map((tr,i)=><div key={i} style={{marginBottom:10}}><div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4,fontWeight:600}}>{tr.name}</div><ColorDot color={tr.color} onChange={c=>updateTrace(i,{color:c})}/></div>)}
        </Section>
      </>}

    </div>
  )

  // ═════════════════════════════════════════════════════════════════════════
  // ── CHART PANEL ──────────────────────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════
  const containerStyle = buildContainerStyle(chartFill, chartBorder, chartShadow, chartGlow, chartSoftEdge, chartSize)

  const chartPanel = (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',borderBottom:'1px solid var(--border)',flexShrink:0,background:'var(--bg-secondary)',flexWrap:'wrap'}}>
        <div ref={layoutMenuRef} style={{position:'relative'}}>
          <button onClick={()=>{setShowLayoutMenu(v=>!v);setShowColorsMenu(false)}}
            style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',background:showLayoutMenu?'rgba(31,111,235,0.14)':'none',border:`1px solid ${showLayoutMenu?'var(--accent-blue)':'var(--border)'}`,borderRadius:5,color:showLayoutMenu?'var(--accent-blue-light)':'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
            Quick Layout
          </button>
          {showLayoutMenu&&(
            <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,width:430,background:'var(--bg-panel)',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 12px 34px rgba(0,0,0,0.45)',zIndex:1500,padding:'10px'}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8}}>
                {QUICK_LAYOUTS.map(layout=>(
                  <button key={layout.id} onClick={()=>{applyQuickLayout(layout.id);setShowLayoutMenu(false)}}
                    style={{padding:'6px',background:activeLayoutId===layout.id?'rgba(31,111,235,0.16)':'var(--bg-tertiary)',border:`1px solid ${activeLayoutId===layout.id?'var(--accent-blue)':'var(--border)'}`,borderRadius:6,cursor:'pointer'}}>
                    <div style={{height:72,background:'#11161d',border:'1px solid #263040',borderRadius:4,padding:5,display:'flex',flexDirection:'column',gap:4}}>
                      {layout.titlePosition!=='none'&&<div style={{height:7,background:'#7fa7d6',borderRadius:2,opacity:0.9}}/>}
                      <div style={{display:'flex',flex:1,gap:4}}>
                        {layout.legendPosition==='left'&&<div style={{width:16,background:'#5679a8',borderRadius:2,opacity:0.8}}/>}
                        <div style={{flex:1,border:'1px solid #3e4f63',borderRadius:2,position:'relative',background:'#0f141b'}}>
                          {layout.showDataLabels&&<div style={{position:'absolute',top:6,right:6,width:22,height:5,background:'#f8b35a',borderRadius:2}}/>}
                        </div>
                        {layout.legendPosition==='right'&&<div style={{width:16,background:'#5679a8',borderRadius:2,opacity:0.8}}/>}
                      </div>
                      {layout.legendPosition==='top'&&<div style={{height:6,background:'#5679a8',borderRadius:2,opacity:0.8}}/>}
                      {layout.legendPosition==='bottom'&&<div style={{height:6,background:'#5679a8',borderRadius:2,opacity:0.8}}/>}
                      {layout.showDataTable&&<div style={{height:9,background:'#243042',borderRadius:2}}/>}
                    </div>
                    <div style={{marginTop:5,fontSize:10,color:'var(--text-secondary)',fontWeight:600}}>{layout.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div ref={colorsMenuRef} style={{position:'relative'}}>
          <button onClick={()=>{setShowColorsMenu(v=>!v);setShowLayoutMenu(false)}}
            style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',background:showColorsMenu?'rgba(31,111,235,0.14)':'none',border:`1px solid ${showColorsMenu?'var(--accent-blue)':'var(--border)'}`,borderRadius:5,color:showColorsMenu?'var(--accent-blue-light)':'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
            Change Colors
          </button>
          {showColorsMenu&&(
            <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,width:360,maxHeight:430,overflowY:'auto',background:'var(--bg-panel)',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 12px 34px rgba(0,0,0,0.45)',zIndex:1500,padding:'10px'}}>
              <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.06em'}}>Colorful</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:8,marginBottom:12}}>
                {EXCEL_COLORFUL_THEMES.map((theme, idx)=>(
                  <button key={`clr-${idx}`} onClick={()=>{applyTheme(`colorful-${idx}`, theme);setShowColorsMenu(false)}}
                    style={{display:'grid',gridTemplateColumns:'repeat(6, 1fr)',gap:3,padding:5,background:activeThemeId===`colorful-${idx}`?'rgba(31,111,235,0.16)':'var(--bg-tertiary)',border:`1px solid ${activeThemeId===`colorful-${idx}`?'var(--accent-blue)':'var(--border)'}`,borderRadius:6,cursor:'pointer'}}>
                    {theme.map((c, ci)=><span key={ci} style={{height:18,borderRadius:3,background:c}}/>) }
                  </button>
                ))}
              </div>

              <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.06em'}}>Monochromatic</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:8,marginBottom:10}}>
                {EXCEL_MONO_THEMES.map((theme, idx)=>(
                  <button key={`mono-${idx}`} onClick={()=>{applyTheme(`mono-${idx}`, theme);setShowColorsMenu(false)}}
                    style={{display:'grid',gridTemplateColumns:'repeat(6, 1fr)',gap:3,padding:5,background:activeThemeId===`mono-${idx}`?'rgba(31,111,235,0.16)':'var(--bg-tertiary)',border:`1px solid ${activeThemeId===`mono-${idx}`?'var(--accent-blue)':'var(--border)'}`,borderRadius:6,cursor:'pointer'}}>
                    {theme.map((c, ci)=><span key={ci} style={{height:18,borderRadius:3,background:c}}/>) }
                  </button>
                ))}
              </div>
              <button onClick={()=>{applyTheme('default', PALETTE);setShowColorsMenu(false)}} style={{padding:'5px 10px',background:'none',border:'1px solid var(--border)',borderRadius:5,color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Reset to Default Palette</button>
            </div>
          )}
        </div>

        <div style={{width:1,height:18,background:'var(--border)',margin:'0 2px'}}/>
        <button onClick={()=>{setSaveName(title||'');setSaveModalOpen(true)}}
          style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',background:'var(--accent-blue)',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
          <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4.414a1 1 0 0 0-.293-.707L11.293.293A1 1 0 0 0 10.586 0H3a1 1 0 0 0-1 1zm0 1h7v3h5v9H2V2zm7.5-.5L13 4.5H9.5V1.5z"/></svg>
          Save
        </button>
        <button onClick={exportPNG} style={{padding:'4px 9px',background:'none',border:'1px solid var(--border)',borderRadius:5,color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>↓ PNG</button>
        <button onClick={exportSVG} style={{padding:'4px 9px',background:'none',border:'1px solid var(--border)',borderRadius:5,color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>↓ SVG</button>
        <div style={{width:1,height:18,background:'var(--border)',margin:'0 2px'}}/>
        {savedMsg&&<span style={{fontSize:11,color:'#3fb950',fontWeight:600,marginLeft:4}}>✓ Saved!</span>}
        <div style={{flex:1}}/>
        <span style={{fontSize:10,color:'var(--text-muted)'}}>{rows.length}/{allRows.length} rows</span>
        <button onClick={()=>setFullscreen(f=>!f)} style={{background:'none',border:'1px solid var(--border)',borderRadius:4,padding:'4px 7px',color:'var(--text-muted)',cursor:'pointer'}}>
          {fullscreen?<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M5.5 0v5.5H0v1h6.5V0zm5 0v1H16V0zm0 6.5V16h1V6.5zm-11 0H0v1h4.5v4.5h1V6.5z"/></svg>:<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M1.5 1h4v1h-3v3h-1zm9 0h4v4h-1v-3h-3zm-9 9h1v3h3v1h-4zm10 3h3v-3h1v4h-4z"/></svg>}
        </button>
      </div>

      {/* Chart area */}
      <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'14px 18px 8px',flexShrink:0,...containerStyle}}>
          {title && titlePosition==='above' && <div style={{textAlign:'center',fontSize:14,fontWeight:700,color:chartVisual.chartTitleColor,marginBottom:6}}>{title}</div>}
          {showLegend&&traces.length>0&&legendPosition==='top'&&<Legend traces={traces} position={legendPosition} textColor={chartVisual.legendTextColor}/>} 
          <div style={{display:'flex',alignItems:'stretch',gap:10}}>
            {showLegend&&traces.length>0&&legendPosition==='left'&&<div style={{width:120,flexShrink:0}}><Legend traces={traces} position={legendPosition} textColor={chartVisual.legendTextColor}/></div>}
            <div ref={chartAreaRef} style={{position:'relative',flex:1}} onClick={()=>{setSelectedSeries(null);setHoveredItem(null)}}>
              {title && titlePosition==='overlay' && <div style={{position:'absolute',left:0,right:0,top:4,textAlign:'center',fontSize:14,fontWeight:700,color:chartVisual.chartTitleColor,zIndex:5,pointerEvents:'none'}}>{title}</div>}
              {renderChart()}
            </div>
            {showLegend&&traces.length>0&&legendPosition==='right'&&<div style={{width:120,flexShrink:0}}><Legend traces={traces} position={legendPosition} textColor={chartVisual.legendTextColor}/></div>}
          </div>
          {showLegend&&traces.length>0&&legendPosition==='bottom'&&<Legend traces={traces} position={legendPosition} textColor={chartVisual.legendTextColor}/>} 
        </div>
        {showSummaryStats&&traces.filter(tr=>tr.yKey).map((tr,i)=>(
          <SummaryStats key={i} rows={rows} yKey={tr.yKey} label={tr.name||tr.yKey} color={tr.color}/>
        ))}
        {showDataTable&&(
          <div style={{padding:'0 12px 14px'}}>
            <DataTable rows={rows} columns={[t?.xKey,...traces.map(tr=>tr.yKey)].filter(Boolean).filter((c,i,a)=>a.indexOf(c)===i&&columns.includes(c))}/>
          </div>
        )}
      </div>
      {hoveredItem&&<div style={{position:'fixed',left:hoveredItem.clientX+14,top:hoveredItem.clientY+14,zIndex:3500,pointerEvents:'none',background:'rgba(13,17,23,0.96)',border:'1px solid #30363d',borderRadius:8,padding:'8px 10px',boxShadow:'0 10px 26px rgba(0,0,0,0.45)',minWidth:150}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
          <span style={{width:9,height:9,borderRadius:999,background:hoveredItem.color||'#58a6ff',display:'inline-block'}}/>
          <span style={{fontSize:11,color:'#e6edf3',fontWeight:700}}>{hoveredItem.seriesName||'Series'}</span>
        </div>
        <div style={{fontSize:10,color:'#8b949e'}}>{String(hoveredItem.label??'')}</div>
        <div style={{fontSize:12,color:'#e6edf3',fontWeight:700,marginTop:2}}>{fmtNum(hoveredItem.value)}</div>
        {hoveredItem.pct!==undefined&&<div style={{fontSize:10,color:'#8b949e',marginTop:2}}>{(hoveredItem.pct*100).toFixed(1)}%</div>}
      </div>}
    </div>
  )

  const inner=(
    <div style={{display:'flex',height:'100%',overflow:'hidden',background:'var(--bg-panel)'}}>
      {leftPanel}{chartPanel}
    </div>
  )

  const saveModal=saveModalOpen&&(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:4000}} onClick={()=>setSaveModalOpen(false)}>
      <div style={{background:'var(--bg-panel)',border:'1px solid var(--border)',borderRadius:10,padding:24,width:360,boxShadow:'0 16px 60px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--text-primary)',marginBottom:14}}>Save Chart</div>
        <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:4}}>Chart name</label>
        <input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="My chart…" autoFocus
          style={{width:'100%',background:'var(--bg-tertiary)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 10px',fontSize:12,color:'var(--text-primary)',outline:'none',boxSizing:'border-box',fontFamily:'inherit',marginBottom:16}}/>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          <button onClick={()=>setSaveModalOpen(false)} style={{padding:'6px 16px',fontSize:12,cursor:'pointer',borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text-secondary)',fontFamily:'inherit'}}>Cancel</button>
          <button onClick={handleSave} style={{padding:'6px 18px',fontSize:12,cursor:'pointer',borderRadius:5,border:'none',background:'var(--accent-blue)',color:'#fff',fontFamily:'inherit',fontWeight:600}}>Save</button>
        </div>
      </div>
    </div>
  )

  if(fullscreen) return <div style={{position:'fixed',inset:0,zIndex:3000,background:'var(--bg-panel)',display:'flex',flexDirection:'column'}}>{inner}{saveModal}</div>
  return <div style={{height:'100%',overflow:'hidden',display:'flex',flexDirection:'column'}}>{inner}{saveModal}</div>
}
