# ASMR Jelly Slicer - Blender Script
# Запустите этот скрипт (Alt+P), чтобы разрезать активный объект Jelly_Cake плоскостью!

import bpy
import bmesh
from mathutils import Vector

def slice_active_jelly(plane_point=(0, 0, 0.65), plane_normal=(1, 0, 0), clear_inner=False):
    obj = bpy.context.active_object
    if not obj or obj.type != 'MESH':
        print("[!] Выберите меш желе для нарезки!")
        return

    # Переход в режим редактирования для честного bmesh bisect
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)

    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(
        bm,
        geom=geom,
        plane_co=Vector(plane_point),
        plane_no=Vector(plane_normal),
        clear_inner=clear_inner,
        clear_outer=False
    )

    # Автоматическая запайка среза ровной крышкой
    cut_edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if cut_edges:
        bmesh.ops.edgenet_fill(bm, edges=cut_edges)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    print("[OK] Желе успешно разрезано и срез запаян!")

# Пример вызова: разрез ровно пополам вдоль оси X
# slice_active_jelly(plane_point=(0, 0, 0.65), plane_normal=(1, 0, 0))
