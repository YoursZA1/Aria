import { useEffect, useRef } from 'react'
import { growFrom, mindTitle, type MindMood } from '../../engine/mind'

type Props = {
  skills: number
  integrity: number
  knowledge: number
  energy: number
  mood: MindMood
}

const VERT = `#version 300 es
precision highp float;
in float aIndex;
uniform float uCount, uTime, uGrow, uLock, uEnergy, uListen, uThink, uSpeak, uSize, uAspect;
out vec3 vColor;

const float GOLD = 2.399963229728653;

vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

void main() {
  float i = aIndex;
  float n = max(uCount - 1.0, 1.0);
  float t = i / n;
  float y = 1.0 - 2.0 * t;
  float rad = sqrt(max(0.0, 1.0 - y * y));
  float theta = GOLD * i + uTime * (0.07 + uGrow * 0.05);
  float phi = acos(clamp(y, -1.0, 1.0));
  float bands = 2.0 + uGrow * 10.0;
  float gyrus = sin(phi * bands) * cos(theta * (1.5 + uGrow * 5.0) + uTime * 0.35);
  float shell = 0.62 + uGrow * 0.95;
  float pulse = 1.0
    + uSpeak * (0.08 + uEnergy * 0.22) * sin(phi * 5.0 - uTime * 7.5)
    + uListen * -0.10
    + uThink * 0.06 * sin(uTime * 5.2 + i * 0.01);
  float radius = shell * (1.0 + gyrus * (0.04 + uGrow * 0.14)) * pulse;
  radius *= 0.55 + 0.45 * uLock;

  float x = cos(theta) * rad;
  float z = sin(theta) * rad;
  float py = y;

  float ring = uGrow * uGrow;
  float uu = theta * (1.0 + uGrow * 0.15);
  float major = 0.78;
  float minor = 0.22 + uGrow * 0.08;
  float tx = (major + minor * rad) * cos(uu);
  float ty = minor * sin(phi * 2.0 + uTime * 0.45) + y * 0.12;
  float tz = (major + minor * rad) * sin(uu);
  x = mix(x, tx, ring);
  py = mix(py, ty, ring);
  z = mix(z, tz, ring);

  float curl = (0.22 * (1.0 - uGrow) + uThink * 0.18) * (1.05 - uLock);
  float tt = uTime * (1.1 + uThink * 1.4);
  x += curl * sin(z * 3.2 + tt);
  py += curl * sin(x * 3.2 + tt * 0.91);
  z += curl * cos(py * 3.2 + tt * 0.73);

  float scale = 1.72 + uSpeak * 0.12 + uEnergy * 0.10;
  vec3 p = vec3(x, py, z) * radius * scale;

  float rot = uTime * 0.08;
  float cy = cos(rot);
  float sy = sin(rot);
  float rx = sin(uTime * 0.12) * 0.08;
  p = vec3(p.x * cy - p.z * sy, p.y, p.x * sy + p.z * cy);
  float cx = cos(rx);
  float sx = sin(rx);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);

  float cam = 4.15;
  float depth = p.z + cam;
  float f = 2.05 / max(0.25, depth);
  gl_Position = vec4(p.x * f / max(uAspect, 0.2), p.y * f, (depth - cam) / 10.0, 1.0);
  gl_PointSize = clamp(uSize * (2.6 / max(0.4, depth * 0.38)), 1.0, 18.0);

  float hue = 0.50 + uGrow * 0.18 + t * 0.07 * uGrow + uSpeak * 0.04 - uThink * 0.06;
  float sat = 0.62 + uGrow * 0.28;
  float lit = 0.32 + uGrow * 0.12 + uEnergy * 0.28 + uSpeak * 0.12 + uListen * 0.08 + abs(gyrus) * 0.08;
  vColor = hsl2rgb(fract(hue), clamp(sat, 0.0, 1.0), clamp(lit, 0.05, 0.92));
}
`

const FRAG = `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 frag;
void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float d = dot(p, p);
  if (d > 0.25) discard;
  float a = smoothstep(0.25, 0.0, d);
  frag = vec4(vColor * a, a);
}
`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('shader')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || 'compile failed'
    gl.deleteShader(sh)
    throw new Error(log)
  }
  return sh
}

export function AriaBrain({ skills, integrity, knowledge, energy, mood }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const live = useRef({ skills, integrity, knowledge, energy, mood })
  live.current = { skills, integrity, knowledge, energy, mood }

  useEffect(() => {
    const el = host.current
    if (!el) return
    const canvas = document.createElement('canvas')
    canvas.className = 'aria-brain-canvas'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    el.appendChild(canvas)
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    })
    if (!gl) {
      el.classList.add('no-webgl')
      return () => canvas.remove()
    }

    let vs: WebGLShader
    let fs: WebGLShader
    try {
      vs = compile(gl, gl.VERTEX_SHADER, VERT)
      fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    } catch {
      el.classList.add('no-webgl')
      return () => canvas.remove()
    }
    const prog = gl.createProgram()
    if (!prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.bindAttribLocation(prog, 0, 'aIndex')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      el.classList.add('no-webgl')
      return
    }
    gl.useProgram(prog)

    const count = window.innerWidth < 720 ? 10_000 : 20_000
    const idx = new Float32Array(count)
    for (let i = 0; i < count; i++) idx[i] = i
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0)

    const loc = {
      count: gl.getUniformLocation(prog, 'uCount'),
      time: gl.getUniformLocation(prog, 'uTime'),
      grow: gl.getUniformLocation(prog, 'uGrow'),
      lock: gl.getUniformLocation(prog, 'uLock'),
      energy: gl.getUniformLocation(prog, 'uEnergy'),
      listen: gl.getUniformLocation(prog, 'uListen'),
      think: gl.getUniformLocation(prog, 'uThink'),
      speak: gl.getUniformLocation(prog, 'uSpeak'),
      size: gl.getUniformLocation(prog, 'uSize'),
      aspect: gl.getUniformLocation(prog, 'uAspect'),
    }

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.disable(gl.DEPTH_TEST)

    const fit = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      const w = el.clientWidth || 320
      const h = el.clientHeight || 320
      const bw = Math.max(1, Math.floor(w * dpr))
      const bh = Math.max(1, Math.floor(h * dpr))
      if (canvas.width === bw && canvas.height === bh) return
      canvas.width = bw
      canvas.height = bh
      gl.viewport(0, 0, bw, bh)
    }
    fit()

    let raf = 0
    let running = true
    const t0 = performance.now()

    const tick = (now: number) => {
      if (!running) return
      const cur = live.current
      const grow = growFrom(cur.skills, cur.knowledge)
      const lock = 0.35 + Math.min(1, Math.max(0, cur.integrity / 100)) * 0.65
      gl.uniform1f(loc.count, count)
      gl.uniform1f(loc.time, (now - t0) / 1000)
      gl.uniform1f(loc.grow, grow)
      gl.uniform1f(loc.lock, lock)
      gl.uniform1f(loc.energy, Math.min(1, Math.max(0, cur.energy)))
      gl.uniform1f(loc.listen, cur.mood === 'listening' ? 1 : 0)
      gl.uniform1f(loc.think, cur.mood === 'thinking' ? 1 : 0)
      gl.uniform1f(loc.speak, cur.mood === 'speaking' ? 1 : 0)
      gl.uniform1f(loc.size, 3.15 - grow * 1.2 + (cur.mood === 'speaking' ? 0.45 : 0))
      gl.uniform1f(loc.aspect, canvas.width / Math.max(1, canvas.height))
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.POINTS, 0, count)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onVis = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        raf = requestAnimationFrame(tick)
      }
    }
    let resizeRaf = 0
    const onResize = () => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        fit()
      })
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(el)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      cancelAnimationFrame(resizeRaf)
      document.removeEventListener('visibilitychange', onVis)
      ro.disconnect()
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      canvas.remove()
    }
  }, [])

  const title = mindTitle(skills, knowledge)

  return (
    <div className="aria-brain" aria-label={`${title}. ${skills} skills.`}>
      <div ref={host} className="aria-brain-webgl" />
      <div className="aria-brain-hud">
        <b>{title}</b>
        <span>{skills} skills · integrity {Math.round(integrity)}</span>
      </div>
    </div>
  )
}
