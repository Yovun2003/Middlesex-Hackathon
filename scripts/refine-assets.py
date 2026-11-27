"""Blender 4.5: bevel original meshes and export optimized, material-batched GLBs.
Run: blender --background --python scripts/refine-assets.py -- /absolute/project/root
The editable source scene is saved under assets/source/noudilo-neighbourhood.blend.
"""
import bpy, bmesh, math, pathlib, sys, json
root = pathlib.Path(sys.argv[sys.argv.index('--') + 1])
manifest = json.loads((root/'public/models/manifest.json').read_text())
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
collections=[]
for asset in manifest['assets']:
    name=pathlib.Path(asset['file']).stem
    bpy.ops.object.select_all(action='DESELECT')
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(root/'public/models'/asset['file']))
    imported=list(set(bpy.data.objects)-before)
    for obj in imported:
        if obj.type!='MESH': continue
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        # Weld exported triangles so architectural bevels remain continuous.
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.0001);bm.to_mesh(obj.data);bm.free()
        material=obj.active_material.name if obj.active_material else ''
        if name!='palm' and not any(s in material.lower() for s in ['glaz','glass','skin']):
            bevel=obj.modifiers.new('Soft manufactured edges','BEVEL');bevel.width=.035 if name in ['house','office'] else .025;bevel.segments=2;bevel.limit_method='ANGLE'
            bpy.ops.object.modifier_apply(modifier=bevel.name)
            normal=obj.modifiers.new('Area weighted normals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=50
            bpy.ops.object.modifier_apply(modifier=normal.name)
        obj.select_set(False)
    for obj in imported: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models'/asset['file']),export_format='GLB',use_selection=True,export_apply=True,export_cameras=False,export_lights=False)
    asset['bytes']=(root/'public/models'/asset['file']).stat().st_size
    asset['triangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in imported if o.type=='MESH')
    asset['refinedWith']='Blender 4.5.9 LTS'
    # Keep each authored asset as an independent editable collection.
    collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
    for obj in imported:
        for previous in list(obj.users_collection): previous.objects.unlink(obj)
        collection.objects.link(obj)
    collections.append(collection)
manifest['pipeline']='Original procedural geometry, refined and exported using Blender 4.5.9 LTS'
(root/'public/models/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/source/noudilo-neighbourhood.blend'))
print('NOUDILO_ASSETS_EXPORTED',json.dumps(manifest['assets']))
