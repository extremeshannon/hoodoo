# Male Jersey (Blunt Collar)

GLB: **`MaleJersey-BluntCollar.glb`**. Male only (Apparel group). Taslan stock palette.

CLO exported **one** material (`Reight Sleeve`) on six primitives. The file on disk was cloned into **six materials** so Front / Back / Sleeves / Collar tint independently.

Configurator parts (sidebar on `/suit.html`):

| Part | Palette | CLO material | Notes |
|---|---|---|---|
| **Collar** | Taslan 18 | `Collar`, `Collar Inner` | Neck + small inner piece |
| **Front** | Taslan 18 | `Front` | +Z body |
| **Back** | Taslan 18 | `Back` | −Z body |
| **Sleeves** | Taslan 18 | `Sleeves`, `Sleeves Right` | Left + right |
| **Hem** | Taslan 18 | — | No separate hem primitive in this export (hem is cut into Front/Back) |
| **Stitch** | Stitch | — | No topstitch in this export |

Default colorway (light / neutral): Front White, Back Silver, Sleeves Silver, Collar Charcoal, Hem Silver, Stitch Raven.

## Upload from Windows (PowerShell)

Host: `ubuntu@vps-dd0254d6.vps.ovh.us`  
Source: `C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\`

```powershell
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\MaleJersey-BluntCollar.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/male-jersey-blunt-collar/MaleJersey-BluntCollar.glb
```

After a fresh CLO export (one shared material again), tell the configurator so materials can be re-cloned per primitive. Refresh https://www.hoodooak.com/suit.html → Pattern → **Apparel** → **Male Jersey (Blunt Collar)**.
