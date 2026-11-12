// Where each weapon's muzzle, bore line and resting magazine sit. The view
// models and the third-person silhouettes both read them, so flashes, smoke
// and reload hands meet the same points whichever model a weapon uses.
const anchor=(muzzle,bore,magRest)=>Object.freeze({muzzle,bore,magRest:Object.freeze(magRest)});
export const WEAPON_ANCHORS=Object.freeze({
 minimi:anchor(-.63,.035,[0,-.03,-.085]),
 mag58:anchor(-1.14,.035,[-.08,-.12,-.04]),
 mp5:anchor(-.65,.035,[0,-.1,-.09]),
 r870:anchor(-.75,.035,[0,-.03,-.05]),
 hecate:anchor(-1.075,.035,[0,-.065,-.075]),
 revolver:anchor(-.183,.011,[-.012,-.022,-.004]),
 ppk:anchor(-.265,.012,[0,-.07,.074])
});
