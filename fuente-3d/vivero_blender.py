"""
Vivero Amazonía Emprende — generador procedural para Blender 5.x

Uso (desde esta carpeta):
  blender -b --python vivero_blender.py
    -> genera el modelo, guarda vivero.blend (gitignorado) y exporta para la web:
       ../vivero/vivero.glb        estructura, cubiertas, mesas, camas y entorno
       ../vivero/disposicion.json  posición de cada mesa y cama (la página pone
                                   ahí las bandejas y las plántulas por código)

Las medidas son ESTIMADAS a partir de fotos (nov. 2026), no levantadas en campo.
Cambiar un número en PARAMETROS y volver a ejecutar regenera todo.
Unidades: metros. Origen: esquina frontal izquierda del bloque de naves.
Blender: X = ancho (a través de las naves), Y = largo (hacia el fondo), Z = altura.
"""
import bpy, bmesh, math, os, random, json
from mathutils import Matrix, Vector

# ============================== PARAMETROS ==============================
P = dict(
    naves=4, ancho_nave=8.0, largo=32.0,
    h_canal=3.0, h_cumbre=4.9,          # altura en la canal y en la clave del arco
    sep_arcos=4.0,                       # separación de arcos y postes a lo largo
    h_malla_int=2.95, flecha_malla=0.28, # malla plana interior y cuánto cuelga
    mesa_ancho=1.2, mesa_mod=3.0, mesa_h=0.82,
    pasillo=0.6, camino=1.2,             # entre mesas y camino central de cada nave
    y_ini=2.0, y_fin=30.6, cruce=(15.4, 16.6),
    camas_nave=3, camas_cols=(2, 3), camas_y=(2.0, 22.0), cama_largo=6.2, cama_h=0.88,
    puerta_ancho=1.6, puerta_h=2.4,
    semilla=11,
)
# ========================================================================

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, "..", "vivero"))
random.seed(P["semilla"])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

NW, AN, LG = P["naves"], P["ancho_nave"], P["largo"]
HC, HK = P["h_canal"], P["h_cumbre"]
ANCHO = NW * AN


# ------------------------------ materiales ------------------------------
# Colores planos: la página les pone textura por nombre (grava, malla, madera...).
COLORES = {
    "Tubo_blanco": ((0.86, 0.87, 0.86), 0.3, 0.4),
    "Acero_negro": ((0.03, 0.03, 0.03), 0.4, 0.55),
    "Polisombra_arco": ((0.55, 0.56, 0.56), 0.0, 0.9),
    "Polisombra_negra": ((0.05, 0.05, 0.05), 0.0, 0.9),
    "Grava": ((0.42, 0.33, 0.26), 0.0, 0.95),
    "Pasto": ((0.20, 0.36, 0.10), 0.0, 0.95),
    "Tierra_seca": ((0.45, 0.38, 0.27), 0.0, 1.0),
    "Via": ((0.50, 0.38, 0.28), 0.0, 1.0),
    "Agua": ((0.10, 0.13, 0.12), 0.0, 0.08),
    "Barro": ((0.20, 0.17, 0.11), 0.0, 0.9),
    "Madera": ((0.62, 0.45, 0.30), 0.0, 0.8),
    "Sustrato": ((0.20, 0.16, 0.11), 0.0, 1.0),
    "PVC": ((0.92, 0.92, 0.9), 0.0, 0.5),
    "Valvula": ((0.85, 0.35, 0.05), 0.0, 0.5),
    "Manguera_roja": ((0.62, 0.08, 0.06), 0.0, 0.5),
    "Manguera_verde": ((0.45, 0.58, 0.40), 0.0, 0.5),
    "Lamina_oxidada": ((0.36, 0.20, 0.13), 0.3, 0.75),
    "Techo_rojo": ((0.70, 0.12, 0.16), 0.1, 0.6),
    "Pared_clara": ((0.78, 0.82, 0.84), 0.0, 0.85),
    "Lona_verde": ((0.10, 0.55, 0.48), 0.0, 0.7),
    "Corteza": ((0.25, 0.19, 0.13), 0.0, 0.9),
    "Follaje": ((0.10, 0.25, 0.07), 0.0, 0.85),
    "Follaje_claro": ((0.22, 0.38, 0.10), 0.0, 0.85),
    "Hoja_platano": ((0.24, 0.45, 0.12), 0.0, 0.7),
    "Letrero": ((0.95, 0.95, 0.93), 0.0, 0.6),
}


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get("Principled BSDF")
    col, met, rough = COLORES[name]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Metallic"].default_value = met
    b.inputs["Roughness"].default_value = rough
    return m


# ------------------------------ constructor de mallas ------------------------------
class B:
    """Acumula primitivas de un material en un solo objeto (pocas llamadas de dibujo)."""
    todos = {}

    @classmethod
    def de(cls, nombre, mat):
        k = (nombre, mat)
        if k not in cls.todos:
            cls.todos[k] = B(nombre, mat)
        return cls.todos[k]

    def __init__(self, nombre, mat):
        self.nombre, self.mat = nombre, mat
        self.bm = bmesh.new()

    def box(self, x0, x1, y0, y1, z0, z1):
        if x1 - x0 <= 1e-4 or y1 - y0 <= 1e-4 or z1 - z0 <= 1e-4:
            return
        m = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ \
            Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1.0))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)

    def tubo(self, p1, p2, r, seg=6):
        p1, p2 = Vector(p1), Vector(p2)
        d = p2 - p1
        if d.length < 1e-4:
            return
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        m = Matrix.Translation((p1 + p2) / 2) @ rot
        bmesh.ops.create_cone(self.bm, cap_ends=False, cap_tris=False, segments=seg,
                              radius1=r, radius2=r, depth=d.length, matrix=m)

    def polilinea(self, pts, r, seg=6):
        for a, b in zip(pts, pts[1:]):
            self.tubo(a, b, r, seg)

    def cono(self, c, r1, r2, h, seg=8):
        m = Matrix.Translation((c[0], c[1], c[2] + h / 2))
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                              radius1=r1, radius2=r2, depth=h, matrix=m)

    def esfera(self, c, r, esc=(1, 1, 1), ruido=0.0, sub=1):
        m = Matrix.Translation(c) @ Matrix.Diagonal((*esc, 1.0))
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=m)
        if ruido:
            for v in res["verts"]:
                v.co += Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.6, 0.6))) * r * ruido

    def rejilla(self, f, nu, nv):
        """Superficie paramétrica f(u, v) -> (x, y, z), u y v en [0, 1]."""
        vs = [[self.bm.verts.new(f(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                self.bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))

    def poligono(self, pts, z):
        vs = [self.bm.verts.new((x, y, z)) for x, y in pts]
        self.bm.faces.new(vs)

    def cara(self, pts):
        self.bm.faces.new([self.bm.verts.new(p) for p in pts])

    def terminar(self):
        if not self.bm.verts:
            self.bm.free()
            return None
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        uv = self.bm.loops.layers.uv.verify()
        for fc in self.bm.faces:
            n = fc.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in fc.loops:
                c = lp.vert.co
                lp[uv].uv = (c.x, c.y) if ax == 2 else ((c.y, c.z) if ax == 0 else (c.x, c.z))
        me = bpy.data.meshes.new(self.nombre)
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.append(material(self.mat))
        ob = bpy.data.objects.new(self.nombre, me)
        scene.collection.objects.link(ob)
        return ob


def g(nombre, mat=None):
    return B.de(nombre, mat or nombre)


# ------------------------------ estructura de las naves ------------------------------
def z_arco(t):
    """t en [-1, 1] a través de la nave -> altura del arco (semielipse)."""
    return HC + (HK - HC) * math.sqrt(max(0.0, 1 - t * t))


arcos = g("Estructura", "Tubo_blanco")
ys = [i * P["sep_arcos"] for i in range(int(LG / P["sep_arcos"]) + 1)]
for k in range(NW + 1):                         # postes y canales en cada línea
    x = k * AN
    for y in ys:
        arcos.tubo((x, y, 0), (x, y, HC), 0.045, 8)
    arcos.tubo((x, 0, HC), (x, LG, HC), 0.05, 8)
for n in range(NW):                             # arcos y correas
    x0 = n * AN
    xc = x0 + AN / 2
    seg = 18
    pts = lambda y: [(xc + (AN / 2) * math.cos(math.pi * (1 - i / seg)), y,
                      z_arco(math.cos(math.pi * (1 - i / seg)))) for i in range(seg + 1)]
    for y in ys:
        arcos.polilinea(pts(y), 0.025)
        # tensor horizontal a la altura de la canal (se ve en las fotos)
        arcos.tubo((x0, y, HC - 0.05), (x0 + AN, y, HC - 0.05), 0.012, 4)
    for t in (-0.6, 0.0, 0.6):
        x = xc + t * AN / 2
        arcos.tubo((x, 0, z_arco(t)), (x, LG, z_arco(t)), 0.02, 6)

# ------------------------------ polisombra ------------------------------
arco_malla = g("Polisombra_arco")
for n in range(NW):
    xc = n * AN + AN / 2
    def f(u, v, xc=xc):
        t = -1 + 2 * u
        y = v * LG
        # cuelga un poco entre arcos
        s = 0.06 * math.sin(math.pi * ((y % P["sep_arcos"]) / P["sep_arcos"])) ** 2
        return (xc + t * AN / 2, y, z_arco(t) + 0.03 - s)
    arco_malla.rejilla(f, 20, int(LG / 1.0))

negra = g("Polisombra_negra")
for n in range(NW):                             # malla plana interior que cuelga
    x0 = n * AN
    def f(u, v, x0=x0):
        y = v * LG
        cu = math.sin(math.pi * u)
        cv = 0.55 + 0.45 * math.sin(math.pi * ((y % P["sep_arcos"]) / P["sep_arcos"]))
        return (x0 + u * AN, y, P["h_malla_int"] - P["flecha_malla"] * cu * cv)
    negra.rejilla(f, 10, int(LG / 0.5))
# costados largos
for x in (0.0, ANCHO):
    negra.cara([(x, 0, 0), (x, LG, 0), (x, LG, HC), (x, 0, HC)])
# culatas (frente y fondo) con puerta en el camino central de cada nave
pa, ph = P["puerta_ancho"], P["puerta_h"]
for y in (0.0, LG):
    for n in range(NW):
        x0, xc = n * AN, n * AN + AN / 2
        negra.cara([(x0, y, 0), (xc - pa / 2, y, 0), (xc - pa / 2, y, HC), (x0, y, HC)])
        negra.cara([(xc + pa / 2, y, 0), (x0 + AN, y, 0), (x0 + AN, y, HC), (xc + pa / 2, y, HC)])
        negra.cara([(xc - pa / 2, y, ph), (xc + pa / 2, y, ph), (xc + pa / 2, y, HC), (xc - pa / 2, y, HC)])
        seg = 18
        bm = negra.bm
        c = bm.verts.new((xc, y, HC))
        ring = [bm.verts.new((xc + (AN / 2) * math.cos(math.pi * (1 - i / seg)), y,
                              z_arco(math.cos(math.pi * (1 - i / seg))) - 0.01)) for i in range(seg + 1)]
        for a, b in zip(ring, ring[1:]):
            bm.faces.new((c, a, b))
        # marco de la puerta
        for dx in (-pa / 2, pa / 2):
            arcos.tubo((xc + dx, y, 0), (xc + dx, y, ph), 0.03, 6)
        arcos.tubo((xc - pa / 2, y, ph), (xc + pa / 2, y, ph), 0.03, 6)

# ------------------------------ piso ------------------------------
g("Piso_grava", "Grava").box(-1.5, ANCHO + 1.5, -1.5, LG + 1.5, -0.05, 0.02)

# ------------------------------ mesas y camas ------------------------------
mw, mp, cm = P["mesa_ancho"], P["pasillo"], P["camino"]
margen = (AN - 4 * mw - 2 * mp - cm) / 2
cols_local = []
x = margen
for i in range(4):
    cols_local.append(x)
    x += mw + (mp if i in (0, 2) else cm)

acero = g("Mesas", "Acero_negro")
madera = g("Camas", "Madera")
sustrato = g("Camas_sustrato", "Sustrato")
pvc = g("Riego_pvc", "PVC")
valv = g("Riego_valvulas", "Valvula")
letrero = g("Letreros", "Letrero")

disp = {"nota": "Medidas estimadas a partir de fotos. Coordenadas de three.js: x, y (altura), z = -y de Blender.",
        "naves": NW, "ancho_nave": AN, "largo": LG, "h_canal": HC, "h_cumbre": HK,
        "mesas": [], "camas": []}


def a_three(x, y):
    return round(x, 3), round(-y, 3)


def mesa(x0, y0, y1, nave, col):
    h = P["mesa_h"]
    t = 0.04
    x1 = x0 + mw
    acero.box(x0, x1, y0, y0 + t, h - t, h)
    acero.box(x0, x1, y1 - t, y1, h - t, h)
    acero.box(x0, x0 + t, y0, y1, h - t, h)
    acero.box(x1 - t, x1, y0, y1, h - t, h)
    for lx in (x0 + 0.05, x1 - 0.09):
        for ly in (y0 + 0.05, y1 - 0.09):
            acero.box(lx, lx + t, ly, ly + t, 0, h - t)
    acero.box(x0 + 0.05, x1 - 0.05, (y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02, 0.18, 0.22)
    cx, cz = a_three((x0 + x1) / 2, (y0 + y1) / 2)
    disp["mesas"].append({"x": cx, "z": cz, "ancho": mw, "largo": round(y1 - y0, 3),
                          "alto": h, "nave": nave + 1, "col": col + 1})


def cama(x0, y0, y1, nave, num):
    h = P["cama_h"]
    x1 = x0 + mw
    e = 0.035
    madera.box(x0, x1, y0, y0 + e, h - 0.28, h)
    madera.box(x0, x1, y1 - e, y1, h - 0.28, h)
    madera.box(x0, x0 + e, y0, y1, h - 0.28, h)
    madera.box(x1 - e, x1, y0, y1, h - 0.28, h)
    madera.box(x0, x1, y0, y1, h - 0.30, h - 0.27)
    sustrato.box(x0 + e, x1 - e, y0 + e, y1 - e, h - 0.27, h - 0.08)
    for ly in [y0 + 0.1 + i * (y1 - y0 - 0.25) / 3 for i in range(4)]:
        for lx in (x0 + 0.06, x1 - 0.10):
            acero.box(lx, lx + 0.04, ly, ly + 0.04, 0, h - 0.30)
    # letrero en la cabecera
    letrero.box(x0 + 0.25, x1 - 0.25, y0 - 0.012, y0, h - 0.27, h - 0.05)
    cx, cz = a_three((x0 + x1) / 2, (y0 + y1) / 2)
    lx, lz = a_three((x0 + x1) / 2, y0 - 0.015)
    disp["camas"].append({"x": cx, "z": cz, "ancho": mw, "largo": round(y1 - y0, 3),
                          "alto": round(h - 0.08, 3), "numero": num,
                          "letrero": {"x": lx, "y": round(h - 0.16, 3), "z": lz,
                                      "ancho": round(mw - 0.5, 3), "alto": 0.22}})


num_cama = 1
for n in range(NW):
    x0n = n * AN
    for c, xl in enumerate(cols_local):
        x0 = x0n + xl
        es_cama = (n == P["camas_nave"] and c in P["camas_cols"])
        y = P["y_ini"]
        if es_cama:
            ya, yb = P["camas_y"]
            while y + P["cama_largo"] <= yb + 1e-6:
                cama(x0, y, y + P["cama_largo"], n, num_cama)
                num_cama += 1
                y += P["cama_largo"] + 0.7
            y = max(y, yb + 0.8)
        while y + P["mesa_mod"] <= P["y_fin"] + 1e-6:
            if y < P["cruce"][1] and y + P["mesa_mod"] > P["cruce"][0]:
                y = P["cruce"][1]
                continue
            mesa(x0, y, y + P["mesa_mod"], n, c)
            y += P["mesa_mod"]
        # riego: tubo PVC al pie de cada hilera, con su llave a la entrada
        xp = x0 + mw / 2
        pvc.tubo((xp, 1.2, 0.04), (xp, P["y_fin"], 0.04), 0.022, 6)
        pvc.tubo((xp, 1.2, 0.04), (xp, 1.2, 0.45), 0.022, 6)
        valv.box(xp - 0.045, xp + 0.045, 1.155, 1.245, 0.28, 0.36)

# mangueras sueltas en los caminos
for n, mat in ((0, "Manguera_verde"), (2, "Manguera_roja"), (3, "Manguera_roja")):
    xc = n * AN + AN / 2
    pts = [(xc + 0.25 * math.sin(i * 0.9) + 0.15 * math.sin(i * 2.3), 0.6 + i * 0.7, 0.02)
           for i in range(30)]
    g("Mangueras_" + mat, mat).polilinea(pts, 0.012, 5)

# ------------------------------ zona de trabajo y casa ------------------------------
ox = g("Bodegas_techo", "Lamina_oxidada")
bod = g("Bodegas_estructura", "Corteza")
pared = g("Casa_paredes", "Pared_clara")
roj = g("Casa_techo", "Techo_rojo")
lona = g("Lona", "Lona_verde")


def cobertizo(x0, x1, y0, y1, h0, h1, mat=ox):
    """Techo de una caída (de y0 a y1) sobre postes."""
    mat.rejilla(lambda u, v: (x0 + u * (x1 - x0), y0 + v * (y1 - y0), h0 + v * (h1 - h0)), 1, 1)
    for x in [x0 + i * (x1 - x0) / 4 for i in range(5)]:
        for y, h in ((y0, h0), (y1, h1)):
            bod.box(x - 0.08, x + 0.08, y - 0.08, y + 0.08, 0, h)


cobertizo(-0.5, 14.0, LG + 1.0, LG + 9.0, 3.6, 3.0)
cobertizo(14.5, 26.0, LG + 2.0, LG + 10.0, 3.4, 2.8)
pared.box(16.0, 25.0, LG + 6.5, LG + 9.8, 0, 2.7)             # cuarto cerrado bajo el techo
lona.box(4.0, 9.0, LG + 0.6, LG + 0.7, 0, 2.2)                # lona verde que se ve al fondo
g("Piso_trabajo", "Barro").box(-1.0, 27.0, LG + 1.5, LG + 10.5, -0.04, 0.01)
# casa de techo rojo
hx0, hx1, hy0, hy1 = 2.0, 10.0, LG + 15.0, LG + 21.0
pared.box(hx0, hx1, hy0, hy1, 0, 2.8)
roj.rejilla(lambda u, v: (hx0 - 0.5 + u * (hx1 - hx0 + 1), hy0 - 0.6 + v * (hy1 - hy0 + 1.2) / 2,
                          2.8 + 1.1 * v), 1, 1)
roj.rejilla(lambda u, v: (hx0 - 0.5 + u * (hx1 - hx0 + 1), (hy0 + hy1) / 2 + v * (hy1 - hy0 + 1.2) / 2,
                          3.9 - 1.1 * v), 1, 1)
for y in (hy0, hy1):   # culatas
    yy = y
    pared.cara([(hx0, yy, 2.8), (hx1, yy, 2.8), ((hx0 + hx1) / 2, yy, 2.8)])
pared.cara([(hx0, hy0, 2.8), (hx0, hy1, 2.8), (hx0, (hy0 + hy1) / 2, 3.85)])
pared.cara([(hx1, hy0, 2.8), (hx1, (hy0 + hy1) / 2, 3.85), (hx1, hy1, 2.8)])

# ------------------------------ terreno ------------------------------
g("Pasto").box(-150, 150, -150, 150, -0.12, -0.06)
g("Lote_seco", "Tierra_seca").box(-10.0, 34.0, -28.0, -3.0, -0.06, -0.03)
# vía destapada que pasa por un costado
via = g("Via")
pts = [(-14 + 2.5 * math.sin(i / 9), -150 + i * 5, 0) for i in range(61)]
for (xa, ya, _), (xb, yb, _) in zip(pts, pts[1:]):
    via.cara([(xa - 2.0, ya, -0.05), (xa + 2.0, ya, -0.05), (xb + 2.0, yb, -0.05), (xb - 2.0, yb, -0.05)])


def charca(cx, cy, r, irr, n=28):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = r * (1 + irr * math.sin(3 * a + cx) + 0.5 * irr * math.sin(5 * a + cy))
        pts.append((cx + rr * math.cos(a) * 1.4, cy + rr * math.sin(a)))
    g("Barro").poligono([(cx + (x - cx) * 1.12, cy + (y - cy) * 1.12) for x, y in pts], -0.055)
    g("Agua").poligono(pts, -0.045)


charca(52.0, 10.0, 14.0, 0.18)       # humedal grande al costado
charca(20.0, LG + 48.0, 9.0, 0.15)   # laguna detrás de la casa
charca(-28.0, LG + 30.0, 6.0, 0.2)

# ------------------------------ vegetación ------------------------------
cort = g("Arboles_tronco", "Corteza")
fol = g("Arboles_copa", "Follaje")
fol2 = g("Arboles_copa_clara", "Follaje_claro")


def arbol(x, y, h=None):
    h = h or random.uniform(6, 12)
    cort.cono((x, y, 0), 0.03 * h, 0.018 * h, h * 0.5, 6)
    dest = fol if random.random() < 0.65 else fol2
    for _ in range(random.randint(5, 7)):
        r = random.uniform(0.27, 0.37) * h
        dest.esfera((x + random.uniform(-0.5, 0.5) * r * 1.3, y + random.uniform(-0.5, 0.5) * r * 1.3,
                     h * random.uniform(0.5, 0.72)), r, (1, 1, random.uniform(0.6, 0.75)), ruido=0.2)


def platano(x, y):
    h = random.uniform(2.6, 3.6)
    cort.cono((x, y, 0), 0.14, 0.09, h, 6)
    hb = g("Platanos", "Hoja_platano").bm
    for k in range(7):
        a = 2 * math.pi * k / 7 + random.uniform(-0.3, 0.3)
        L = random.uniform(1.6, 2.4)
        d = Vector((math.cos(a), math.sin(a), 0))
        s = Vector((-d.y, d.x, 0)) * 0.28
        base = Vector((x, y, h))
        p = [base + d * (L * t) + Vector((0, 0, 0.9 * t - 1.3 * t * t)) for t in (0, 0.35, 0.7, 1.0)]
        vs = [(hb.verts.new(q - s * w), hb.verts.new(q + s * w)) for q, w in zip(p, (0.2, 1, 0.9, 0.1))]
        for (a1, b1), (a2, b2) in zip(vs, vs[1:]):
            hb.faces.new((a1, b1, b2, a2))


for _ in range(16):   # platanera junto a las naves
    platano(random.uniform(ANCHO + 2.5, ANCHO + 8), random.uniform(-2, 14))
for _ in range(8):   # esquina frontal, lejos de las puertas
    platano(random.uniform(ANCHO - 2, ANCHO + 6), random.uniform(-8, -3.5))
# árboles alrededor (evitando naves, zona de trabajo y agua)
libres = 0
while libres < 70:
    x, y = random.uniform(-90, 100), random.uniform(-80, 120)
    if -16 < x < ANCHO + 12 and -30 < y < LG + 26:
        continue
    if (x - 52) ** 2 / 2 + (y - 10) ** 2 < 300 or (x - 20) ** 2 + (y - LG - 48) ** 2 < 170:
        continue
    if -20 < x < -8:   # la vía
        continue
    arbol(x, y)
    libres += 1
for _ in range(10):   # algunos cerca, como en las fotos
    arbol(random.uniform(-6, ANCHO + 10), random.uniform(LG + 11, LG + 26), random.uniform(5, 9))
# franja de bosque al fondo
for i in range(60):
    a = random.uniform(-150, 150)
    arbol(a, random.uniform(110, 140), random.uniform(12, 20))
    arbol(random.uniform(-140, -100), random.uniform(-140, 140), random.uniform(12, 20))

# ------------------------------ cerrar y exportar ------------------------------
for b in list(B.todos.values()):
    b.terminar()

tris = sum(len(p.vertices) - 2 for o in scene.objects if o.type == "MESH" for p in o.data.polygons)
os.makedirs(WEB, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "vivero.blend"))
glb = os.path.join(WEB, "vivero.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_apply=True, export_yup=True,
                          export_lights=False, export_cameras=False,
                          export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=7)
disp["resumen"] = {"mesas": len(disp["mesas"]), "camas": len(disp["camas"]),
                   "area_m2": round(ANCHO * LG, 1)}
with open(os.path.join(WEB, "disposicion.json"), "w", encoding="utf-8") as fh:
    json.dump(disp, fh, ensure_ascii=False, separators=(",", ":"))
print(f"VIVERO_OK glb={os.path.getsize(glb) / 1e6:.2f} MB triangulos~{tris} "
      f"mesas={len(disp['mesas'])} camas={len(disp['camas'])}")
