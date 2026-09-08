# CLO3D → Hoodoo configurator

One mesh per garment × fit. Hide the avatar if you can; export garment only.

**Prefer one-file GLB** (File → Export → glTF 2.0 → **GLB**). Split glTF is OK if **all** files travel together: `.gltf` + `.bin` + every texture the file references, in the same folder.

Do **not** use `/3d/model.glb` (sample duck). Missing files show a drop-file / awaiting state — not the duck.

This VPS bind-mounts `3d/` into `hoodoo_api`. After `scp` finishes, refresh https://www.hoodooak.com/suit.html.

## Folders

| Slot | Folder | Expected GLB |
|---|---|---|
| Freefly Jacket · Female | `3d/clo/female-jacket/` | `FemaleJacket.glb` |
| Pants · Female | `3d/clo/female-pants/` | `FemalePants.glb` |
| Freefly Jacket · Male | `3d/clo/male-jacket/` | `MaleJacket.glb` |
| Pants · Male | `3d/clo/male-pants/` | `MalePant.glb` (singular — as exported) |
| Ultimate Paw Covers · Unisex | `3d/clo/upc/` | `UPC.glb` (snowmachine gauntlets — one model) |
| Jumpsuit · Female | `3d/clo/female-jumpsuit/` | `FamaleJumpSuit.glb` (as typed) **or** `FemaleJumpSuit.glb` — configurator tries Famale first |
| Jumpsuit · Male | `3d/clo/male-jumpsuit/` | `MaleJumpSuit.glb` |

Youth and Camera Jacket slots stay wired to later filenames.

## Upload from Windows (PowerShell)

Host: `ubuntu@vps-dd0254d6.vps.ovh.us`  
Source: `C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\`

```powershell
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\FemaleJacket.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/female-jacket/FemaleJacket.glb
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\FemalePants.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/female-pants/FemalePants.glb
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\MaleJacket.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/male-jacket/MaleJacket.glb
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\MalePant.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/male-pants/MalePant.glb
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\UPC.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/upc/UPC.glb
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\FamaleJumpSuit.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/female-jumpsuit/FamaleJumpSuit.glb
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\FemaleJumpSuit.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/female-jumpsuit/FemaleJumpSuit.glb
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\MaleJumpSuit.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/male-jumpsuit/MaleJumpSuit.glb
```

Female jumpsuit: Shannon typed **FamaleJumpSuit**. Paste the Famale line if that’s the file on disk; paste the Female line if the export is spelled correctly. The Pattern card loads Famale first, then Female.

## Mesh names (for color picker)

- Jacket: `torso` / `body`, `sleeve` / `arm`, `collar`, `cordura`, `trim`
- Jumpsuit: same as jacket plus `leg` / `pant` / `thigh` (inspect after GLBs land)
- Pants: `leg` / `pant`, `bootie`, `cordura`, `trim`
- Ultimate Paw Covers: `body` (black Taslan shells **and cuff**), `trim` (Taslan stock — not in current UPC.glb; add piping/binding in CLO and re-export), `embroidery` (text + thread; no mesh in current UPC.glb)

## Cut / print (optional)

DXF or SVG into `3d/clo/cut/` when you want real piece geometry in the print/cut zip.
