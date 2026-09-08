# Female Jumpsuit

Drop the female jumpsuit GLB here. Shannon’s export may be spelled **`FamaleJumpSuit.glb`** (typo) or **`FemaleJumpSuit.glb`**. The configurator tries Famale first, then Female — land either name.

Do **not** use `/3d/model.glb` (sample duck). Missing files show a waiting / stand-in state.

## Upload from Windows (PowerShell)

Host: `ubuntu@vps-dd0254d6.vps.ovh.us`  
Source: `C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\`

Paste **whichever filename you actually have** (or both):

```powershell
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\FamaleJumpSuit.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/female-jumpsuit/FamaleJumpSuit.glb
scp "C:\Users\shannon\Dropbox\Master Website\Hoodoo Config\FemaleJumpSuit.glb" ubuntu@vps-dd0254d6.vps.ovh.us:/home/ubuntu/projects/hoodoo/3d/clo/female-jumpsuit/FemaleJumpSuit.glb
```

After `scp` finishes, refresh https://www.hoodooak.com/suit.html → Pattern → **Jumpsuit** → Female.

Parts (until the GLB is inspected): Collar, Front, Back, Sleeves, Legs, Zipper, Waist Band, Stitch — jacket-style Taslan/Spandex rules, plus Legs.
