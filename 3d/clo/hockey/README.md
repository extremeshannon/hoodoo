# Hockey

GLB: **`Hockey.glb`**. Unisex (Apparel group). Taslan stock palette. Each CLO `HockeyBasic_*` fabric is its own sidebar colorway — stripes are **not** grouped as Trim.

Configurator parts (sidebar on `/suit.html`):

| Part | Palette | CLO materials |
|---|---|---|
| **Collar** | Taslan 18 | `HockeyBasic_477649` |
| **Yoke** | Taslan 18 | `HockeyBasic_477593`, `HockeyBasic_477621` |
| **Front** | Taslan 18 | `HockeyBasic_477565` |
| **Back** | Taslan 18 | `HockeyBasic_477985` |
| **Sleeves** | Taslan 18 | `HockeyBasic_477789`, `HockeyBasic_477677` |
| **Sleeve stripe 1** | Taslan 18 | `HockeyBasic_477817`, `HockeyBasic_477733` |
| **Sleeve stripe 2** | Taslan 18 | `HockeyBasic_477845`, `HockeyBasic_477705` |
| **Sleeve stripe 3** | Taslan 18 | `HockeyBasic_477873`, `HockeyBasic_477761` |
| **Hem stripe 1** | Taslan 18 | `HockeyBasic_477901`, `HockeyBasic_478013` |
| **Hem stripe 2** | Taslan 18 | `HockeyBasic_477929`, `HockeyBasic_478041` |
| **Hem stripe 3** | Taslan 18 | `HockeyBasic_477957`, `HockeyBasic_478069` |
| **Stitch** | Stitch | `Coverstitch_*` on Topstitch / BindedTrim |

`FABRIC 1_*` primitives are lining (left untinted). Default colorway is light / neutral (white / silver / charcoal), not the CLO purple/teal preview.

## Upload from Windows (PowerShell)

Host: `ubuntu@vps-dd0254d6.vps.ovh.us`  
Source: `C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\`

```powershell
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\Hockey.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/hockey/Hockey.glb
```

After `scp` finishes, refresh https://www.hoodooak.com/suit.html → Pattern → **Apparel** → **Hockey**.
