# Ultimate Paw Covers (snowmachine gauntlets)

One unisex CLO model. Keep the exported filename **`UPC.glb`**.

Configurator parts (sidebar on `/suit.html`):

| Part | Palette | 3D / job |
|---|---|---|
| **Body** | Locked Black (`#000000`) | Large gauntlet shells. Forced black. |
| **Trim** | Taslan 18 stock (named swatches) | Smaller wrist / cuff extensions. |
| **Embroidery** | Thread: Raven, White, Red, Navy, Royal, Canary | Text field + thread color. No embroidery mesh in the current export — stored in `job.json`. |

Do **not** use jacket Collar/Front/Back/Sleeves on UPC. Do **not** use `/3d/model.glb` (sample duck).

## Current `UPC.glb` (CLO 2026.1)

One `Cloth_mesh`, 8 primitives, all materials named `FABRIC 1_1741665`. Split by primitive size:

- Body: primitives 0, 2, 4, 6 (~20k verts each)
- Trim: primitives 1, 3, 5, 7 (~2.9k verts each)
- Embroidery: no logo/text mesh — UI still collects text + color for production

Re-export with named Taslan / trim / logo materials when you can; name matching will take over.

## Upload from Windows (PowerShell)

Host: `ubuntu@vps-dd0254d6.vps.ovh.us`  
Source: `C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\UPC.glb`

```powershell
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\UPC.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/upc/UPC.glb
```

After `scp` finishes, refresh https://www.hoodooak.com/suit.html → Pattern → **Ultimate Paw Covers**.
