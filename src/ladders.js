// Climbable ladders, shared by the renderer and the authoritative server.
// Each one is a point on the face it is fixed to, the face's outward normal
// and the height of the roof it leads to.
export const LADDERS=Object.freeze({
 factory:[{x:22.6,z:12,nx:-1,nz:0,top:2.9},{x:-22.6,z:1,nx:1,nz:0,top:2.9},{x:5,z:20.6,nx:0,nz:-1,top:2.9},{x:-14,z:22.6,nx:0,nz:-1,top:2.9},{x:24,z:-23.6,nx:0,nz:1,top:2.9}],
 gardens:[{x:11,z:25,nx:-1,nz:0,top:2.69},{x:11,z:-25,nx:-1,nz:0,top:2.69}],
 railway:[{x:-9,z:-10.5,nx:0,nz:1,top:3.6},{x:-9,z:5.5,nx:0,nz:-1,top:3.6},{x:9,z:-3.5,nx:0,nz:1,top:3.6},{x:9,z:13.5,nx:0,nz:-1,top:3.6}],
 desert:[{x:-12,z:11,nx:0,nz:1,top:3},{x:12,z:-16,nx:-1,nz:0,top:3},{x:-19,z:-2,nx:1,nz:0,top:3},{x:19,z:6,nx:-1,nz:0,top:3}],
 market:[{x:-22.175,z:16,nx:-1,nz:0,top:4.25},{x:22.175,z:-16,nx:1,nz:0,top:4.25}],
 harbor:[{x:17.5,z:7,nx:-1,nz:0,top:2.6},{x:22.5,z:10,nx:1,nz:0,top:2.6},{x:-5.5,z:-10,nx:0,nz:-1,top:3.25},{x:-5.5,z:10,nx:0,nz:1,top:3.25},{x:-8,z:23.2,nx:0,nz:1,top:2.6}]
});
export const laddersFor=id=>LADDERS[id]||[];
