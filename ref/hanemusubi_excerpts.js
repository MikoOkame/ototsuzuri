/* 羽結び（HaneMusubi_dev.html）からの抜粋 ― 窓辺のオルゴール用の参考資料
   ------------------------------------------------------------------
   ・これは実行用のファイルではない。手本として読み、src/orgel_dev.html に書き直して使う。
   ・コードは本体からそのまま切り出している（行番号は本体の位置）。日本語の注記だけ追加した。
   ・three.js 0.160。色は srgb() でシェーダーに渡す前提。
   ・羽結びの「水面の動きは触らない」約束は羽結び本体の話。こちらでは自由に調整してよい。
   ・収録：A 依存（配色・srgb・ノイズ・影色） / B 舞台の組み立て / C 空 / D 遠山 / E 海 /
           F 雲 / G 毎フレームの更新 / H 首の向き / I 音符
*/

/* ==================================================================
   A-1. 配色（本体 506–531行）
   昼の海の配色。こちらでは同じ項目を 夜明け・朝・昼・夕方・夜 の5つ持ち、補間する。
   spots / maxFlock / rare / enemies / goal は羽結びのゲーム用なので不要。
================================================================== */

/* every stage is one palette plus a few placement numbers. mountain and
   storm reuse the same builders with a different entry here. */
const STAGES = {
  sea: {
    name:'一日目・海渡り',
    skyTop:0xf4c49a, skyBottom:0xf2e5c9, glow:0xffd9a8,
    fog:0xf0e2c6, fogNear:140, fogFar:1150,
    seaDeep:0x7fa3a0, seaLight:0xc2d3c2,
    sand:0xe3d7b0, bed:0x93a08a, shoal:0xa6cfbd,   // floor seen through the shallows, and the water over it
    sun:[0.55,0.28,0.78], sunColor:0xffe4c0, sunI:1.8,
    hemiSky:0xfbe6cc, hemiGround:0xc6bff4, hemiI:1.7,   // lavender from below: shade keeps colour
    hills:[                                   // far -> near
      {r:1420, h:110, col:0xc2cfb2, seed:1.3, bias:-.05},
      {r:1300, h: 80, col:0xa7bca6, seed:4.1, bias:-.15},
      {r:1180, h: 55, col:0x87a39a, seed:7.7, bias:-.35},
    ],
    goal:[0,0,820],
    // rocks the lone birds wait on: x, z, height
    // index 6 is off the route: the rare bird only lands there once the flock is big
    spots:[[-35,110,3],[48,205,5],[-72,320,2.5],[26,435,7],[88,560,4],[-46,665,6],[132,470,8]],
    maxFlock:6,
    rare:{spot:6, minFlock:4},
    enemies:[],          // hawks go here from the mountain on
    cloud:0xfff6e8,
  },
};

/* ==================================================================
   A-2. srgb() とノイズ関数（本体 533–543行）
   空・海のシェーダーが ${GLSL_NOISE} として埋め込んで使う。
================================================================== */

function srgb(hex){ const c=new THREE.Color(hex); c.convertLinearToSRGB(); return new THREE.Vector3(c.r,c.g,c.b); }

const GLSL_NOISE = `
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+1.),f.x), f.y);
}
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+17.; a*=.5; } return v; }
// 3 octaves: for washes whose finest octaves are sub-pixel or fogged out anyway
float fbm3(vec2 p){ float v=0., a=.5; for(int i=0;i<3;i++){ v+=a*noise(p); p=p*2.03+17.; a*=.5; } return v*1.107; }

/* ==================================================================
   A-3. 影の色（本体 582行）
   海のシェーダーが参照する。鳥の影を持ってこないなら不要。
================================================================== */

const SHADE_SRGB = 'vec3(.52,.57,.93)', SHADE_LIN = 'vec3(.23,.28,.84)';

/* ==================================================================
   B. 舞台の組み立ての冒頭（本体 737–746行）
   霧・太陽光・半球光。太陽の向き sunDir は空と海が共有する。
   こちらでは太陽と月を別にし、時刻から向きを計算して毎フレーム uniform を更新する。
================================================================== */

const stage = (()=>{
  const S = STAGES.sea;
  const sunDir = new THREE.Vector3(...S.sun).normalize();

  scene.background = new THREE.Color(S.fog);
  scene.fog = new THREE.Fog(S.fog, S.fogNear, S.fogFar);

  const sun = new THREE.DirectionalLight(S.sunColor, S.sunI);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun, new THREE.HemisphereLight(S.hemiSky, S.hemiGround, S.hemiI));

/* ==================================================================
   C. 空（本体 748–775行）
   グラデーションのドーム＋ノイズの滲み。カメラに追従させる（G 参照）。
   方位は角度でなく円上の点としてノイズに渡している（真西の継ぎ目対策）。
================================================================== */

  /* ---- sky: gradient dome with a soft wash, rides with the camera ---- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1600, 32, 16),
    new THREE.ShaderMaterial({
      side:THREE.BackSide, depthWrite:false, fog:false,
      uniforms:{ uTop:{value:srgb(S.skyTop)}, uBot:{value:srgb(S.skyBottom)},
                 uGlow:{value:srgb(S.glow)}, uSun:{value:sunDir} },
      vertexShader:`varying vec3 vW;
        void main(){ vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.); }`,
      fragmentShader:`varying vec3 vW; uniform vec3 uTop,uBot,uGlow,uSun;
        ${GLSL_NOISE}
        void main(){
          vec3 d=normalize(vW-cameraPosition);
          float h=max(d.y,0.);
          vec3 col=mix(uBot,uTop,smoothstep(.0,.5,pow(h,.8)));
          float s=max(dot(d,uSun),0.);
          col=mix(col,uGlow,pow(s,6.)*.55*(1.-smoothstep(.0,.7,h)));
          // uneven wash. fed the heading as a point on a circle, not an angle:
          // atan() jumps from +pi to -pi due west and the noise tore there
          vec2 hd=normalize(d.xz+vec2(1e-5));
          float w=fbm(hd*2.6 + vec2(h*5., -h*3.));
          col*=.975+.05*w;
          gl_FragColor=vec4(col,1.);
        }`
    })
  );
  sky.renderOrder = -2;
  scene.add(sky);

/* ==================================================================
   D. 遠山（本体 777–802行）
   地平を囲む重なったシルエット。頂点色で下端を霧色へ寄せる。
================================================================== */

  /* ---- hills: layered silhouettes ringing the horizon ---- */
  const hills = new THREE.Group();
  const fogC = new THREE.Color(S.fog);
  for(const L of S.hills){
    const N = 420, pos=[], col=[], idx=[];
    const top = new THREE.Color(L.col), bot = top.clone().lerp(fogC,.55);
    for(let i=0;i<=N;i++){
      const a = i/N*Math.PI*2;
      let n = 0.55*Math.sin(a*3+L.seed) + 0.30*Math.sin(a*7+L.seed*2.3)
            + 0.18*Math.sin(a*13+L.seed*5.1) + 0.07*Math.sin(a*29+L.seed*9.7);
      n = Math.max(0, n*0.5+0.5+L.bias);
      const h = L.h * Math.pow(n,1.4) + 2;
      const x = Math.cos(a)*L.r, z = Math.sin(a)*L.r;
      pos.push(x,h,z, x,-60,z);
      col.push(top.r,top.g,top.b, bot.r,bot.g,bot.b);
      if(i<N){ const k=i*2; idx.push(k,k+1,k+2, k+1,k+3,k+2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors:true, fog:false, side:THREE.DoubleSide}));
    m.renderOrder = -1;
    hills.add(m);
  }
  scene.add(hills);

/* ==================================================================
   E. 海（本体 804–983行）
   窓から遠目に眺めるだけなので、次は【持ってこない】：
     ・uRip / ripTex / RIP_*（鳥が水面に起こす波紋。本体 985行以降のシミュレーションも不要）
     ・uShal / shalTex / SHAL_*（岩や島の周りの浅瀬）
     ・uShadows / SHADOW_GLSL / shade() / birdShade()（鳥の影）
   シェーダー内の該当箇所：「the bird's own ripples」「shallows」「over deep water the shadow」
   「ripples painted as contour lines」のブロック。rin・sh・shW・shBed は 0 として扱えばよい。
   残す芯：fbm で歪ませた水彩の濃淡、うねり waves()、太陽方向の照り返し(sheen)、きらめき(sparkles)、霧。
   近景だけの細波（near）は、窓からの距離では効かない可能性が高い。見て判断。
================================================================== */

  /* ---- sea: flat, world-space watercolour that scrolls under the bird,
     so the pattern itself reads speed and altitude.
     two data textures feed it:
       uRip  - a small ripple simulation that rides along under the bird
               (wake when skimming low, rings when it touches the water)
       uShal - a baked shallows map around every rock and the goal island,
               where the floor shows through, refracted by the surface ---- */
  const RIP_N = 96, RIP_CELL = 0.4, RIP_L = RIP_N*RIP_CELL;     // 38.4 m window
  const ripPx = new Uint8Array(RIP_N*RIP_N*4).fill(128);
  const ripTex = new THREE.DataTexture(ripPx, RIP_N, RIP_N);
  ripTex.magFilter = ripTex.minFilter = THREE.LinearFilter;
  ripTex.needsUpdate = true;

  const SHAL_N = 1024, SHAL_L = 2300, SHAL_O = -SHAL_L/2;       // ~2.2 m per texel, one byte each
  const shalPx = new Uint8Array(SHAL_N*SHAL_N);
  const shalTex = new THREE.DataTexture(shalPx, SHAL_N, SHAL_N, THREE.RedFormat);
  shalTex.unpackAlignment = 1;
  shalTex.magFilter = shalTex.minFilter = THREE.LinearFilter;

  const seaMat = new THREE.ShaderMaterial({
    fog:false,
    uniforms:{ uT:{value:0}, uDeep:{value:srgb(S.seaDeep)}, uLight:{value:srgb(S.seaLight)},
               uFog:{value:srgb(S.fog)}, uNear:{value:S.fogNear*0.6}, uFar:{value:S.fogFar},
               uSun:{value:sunDir}, uGlow:{value:srgb(S.glow)},
               uSand:{value:srgb(S.sand)}, uBed:{value:srgb(S.bed)}, uShoal:{value:srgb(S.shoal)},
               uRip:{value:ripTex}, uRipO:{value:new THREE.Vector2()}, uRipL:{value:RIP_L},
               uShal:{value:shalTex}, uShalO:{value:SHAL_O}, uShalL:{value:SHAL_L},
               uShadows:shadowU.uShadows },
    vertexShader:`varying vec3 vW;
      void main(){ vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.); }`,
    fragmentShader:`precision highp float; varying vec3 vW;
      uniform float uT,uNear,uFar,uRipL,uShalO,uShalL; uniform vec3 uDeep,uLight,uFog,uSun,uGlow,uSand,uBed,uShoal;
      uniform vec2 uRipO; uniform sampler2D uRip, uShal;
      ${SHADOW_GLSL}
      // the bird's shadow as a soft disc, looked up wherever the caller says
      // the light actually lands (bent surface, or the floor under it)
      float shade(vec2 at){ return birdShade(vec3(at.x, 0., at.y)); }
      ${GLSL_NOISE}
      // a handful of travelling waves: gives a surface normal that really
      // moves, which is what makes the glints crawl and twinkle
      vec3 waves(vec2 p, float t){
        vec2 D[4]; D[0]=vec2(.8,.6); D[1]=vec2(-.5,.87); D[2]=vec2(.2,-.98); D[3]=vec2(-.9,-.3);
        float F[4]; F[0]=.35; F[1]=.62; F[2]=1.1; F[3]=1.9;
        float h=0.; vec2 g=vec2(0.);
        for(int i=0;i<4;i++){
          float ph=dot(p,D[i])*F[i] + t*1.6*sqrt(9.8*F[i]);
          float a=.12/F[i];
          h+=a*sin(ph); g+=a*F[i]*cos(ph)*D[i];
        }
        return vec3(g,h);
      }
      void main(){
        vec2 p=vW.xz;
        float dist=length(p-cameraPosition.xz);
        // past the fog wall the answer is known: skip everything
        if(dist>=uFar){ gl_FragColor=vec4(uFog,1.); return; }
        float t=uT*2.2;
        float near=1.-smoothstep(6.,45.,dist);        // close-up detail, faded before it can alias

        // warp the wash so it swirls instead of sliding rigidly
        vec2 q=p+8.*vec2(fbm3(p*.02+vec2(t*.05,0.)), fbm3(p*.02+vec2(0.,-t*.04)));
        float big=fbm3(q*.005+vec2(t*.012,0.));
        float mid=fbm(q*.022+vec2(t*.02,t*.03));
        vec3 col=mix(uDeep,uLight,smoothstep(.3,.72,big));
        float edge=1.-smoothstep(0.,.035,abs(mid-.52));
        col=mix(col,uDeep*.88,edge*.3);
        col=mix(col,uLight*1.03,smoothstep(.55,.75,mid)*.3);
        // two ripple fields crossing each other
        float r1=fbm3(vec2(q.x*.07,q.y*.24)+vec2(t*.35,t*.12));
        float r2=fbm3(vec2(q.x*.22,q.y*.08)+vec2(-t*.22,t*.3));
        col+=smoothstep(.6,.76,r1)*.05 + smoothstep(.62,.78,r2)*.035;
        col-=smoothstep(.6,.3,r1*r2*2.)*.02;

        // the long swell: bent by the same warp as the wash so its crests curve
        // instead of lining up into a grid, strong in wind-roughened patches and
        // calm between them, and eased off as the camera climbs so the view from
        // high up reads as broad light and dark rather than repeating stripes
        vec3 w=waves(mix(p,q,.7),uT);
        float gust=mix(.3,1.35,smoothstep(.28,.72,fbm3(q*.011+vec2(-t*.03,t*.02))));
        float high=smoothstep(14.,70.,cameraPosition.y);
        vec2 gsum=w.xy*1.6*gust*mix(1.,.4,high);
        // fine chop: small wavelets only visible when the camera is low and close
        vec2 cg=vec2(0.);
        if(near>0.){
          vec2 E[3]; E[0]=vec2(.94,.34); E[1]=vec2(-.6,.8); E[2]=vec2(.1,-1.);
          float G[3]; G[0]=3.1; G[1]=5.3; G[2]=8.7;
          for(int i=0;i<3;i++){
            float ph=dot(p,E[i])*G[i] + uT*1.6*sqrt(9.8*G[i]);
            cg+=.03*cos(ph)*E[i];
          }
          vec2 e=vec2(.35,0.), o=vec2(uT*.9,uT*.6);
          float nn=fbm3(p*1.1+o);
          cg+=vec2(fbm3(p*1.1+e+o)-nn, fbm3(p*1.1+e.yx+o)-nn)*.3;
          gsum+=cg*near*mix(.6,1.1,gust);
        }

        // the bird's own ripples
        vec2 ru=(p-uRipO)/uRipL;
        float rin=smoothstep(0.,.14,ru.x)*smoothstep(1.,.86,ru.x)*smoothstep(0.,.14,ru.y)*smoothstep(1.,.86,ru.y);
        float rh=0.;
        if(rin>0.){
          vec4 rt=texture2D(uRip,ru);
          gsum+=(rt.xy*2.-1.)*2.*rin;
          rh=(rt.z*2.-1.)*rin;
        }

        vec3 n=normalize(vec3(-gsum.x,1.,-gsum.y));
        vec3 v=normalize(vW-cameraPosition);
        vec3 r=reflect(v,n);
        float s=max(dot(r,uSun),0.);
        float fr=pow(1.-max(dot(-v,n),0.),4.);

        // shallows: the floor shows through, bent by the same normal
        vec2 su=(p-uShalO)/uShalL;
        float sh=(su.x>0.&&su.x<1.&&su.y>0.&&su.y<1.) ? texture2D(uShal,su).r : 0.;
        float shBed=0.;
        if(sh>.004){
          vec2 pb=p-n.xz*(.6+1.6*(1.-sh));             // deeper water bends the view further
          float peb=noise(pb*2.4);
          vec3 bed=mix(uSand,uBed,smoothstep(.25,.85,noise(pb*.3))*.55+smoothstep(.58,.82,peb)*.35);
          float c1=noise(pb*.9+vec2(uT*.35,uT*.2)), c2=noise(pb*1.3-vec2(uT*.25,uT*.3));
          float caus=pow(max(0.,1.-abs(c1+c2-1.)),7.);  // light gathered by the moving surface
          // on the floor the shadow wobbles with the refraction and kills the caustics
          shBed=shade(pb+n.xz*.8);
          bed+=caus*vec3(1.,.96,.84)*.24*smoothstep(.3,.85,sh)*max(0.,1.-shBed*1.6);
          bed*=mix(vec3(1.), ${SHADE_SRGB}, shBed);
          // clear water over the floor: the tint thins toward the rock
          bed=mix(bed,uShoal,(1.-sh)*.65);
          col=mix(col,bed,smoothstep(0.,.6,sh)*.85*(1.-fr*.5));
          // watercolour: pigment pools where the shallow wash ends
          col=mix(col,uDeep*.86,(1.-smoothstep(0.,.05,abs(sh-.16)))*.2);
          // a broken foam line hugging the rock
          float fo=smoothstep(.84,.96,sh)*smoothstep(.42,.7,noise(p*.9+vec2(uT*.5,-uT*.4)+n.xz*3.));
          col=mix(col,vec3(1.,.985,.94),fo*.55);
        }

        // over deep water the shadow is only the body of the water darkening:
        // soft, cool, and broken up by the slope of the surface
        float shW=shade(p+n.xz*1.4)*(1.-smoothstep(.15,.7,sh));
        col*=mix(vec3(1.), ${SHADE_SRGB}, shW*.85);

        // facets toward the sun catch light, facets away go into the colour
        float lit=dot(n,uSun)-dot(vec3(0.,1.,0.),uSun);
        col+=lit*vec3(.9,.8,.6)*(.08+near*.22);
        // grazing view reflects the sky, looking straight down shows the body of water
        col=mix(col,uFog*1.02,fr*.3);
        col=mix(col,uDeep*.92,(1.-fr)*near*.18);
        if(near>0.){
          // painted highlight lines on the crests, close in
          float crest=smoothstep(.62,.7,fbm3(vec2(p.x*.9,p.y*.45)+cg*2.+vec2(uT*.7,uT*.3)));
          col=mix(col,uLight*1.08,crest*near*.35);
        }
        // ripples painted as contour lines: every level of the height field
        // gets a thin pale stroke, so rings and the wake read like brushwork
        if(rin>0.){
          float lv=abs(fract(rh*9.)-.5);
          float ink=(1.-smoothstep(.06,.2,lv))*smoothstep(.015,.07,abs(rh));
          col=mix(col,rh>0.?uLight*1.14:uDeep*.86,ink*(rh>0.?.6:.3));
          col=mix(col,uLight*1.06,smoothstep(.05,.5,rh)*.2);
        }
        // broad sheen toward the sun
        col=mix(col,uGlow*1.05,pow(s,10.)*.22*(1.-shW*.8));
        // sparkles: sharp highlight, broken up into points that blink
        if(dist<700.){
          // cells laid on the warped coords so they don't line up into rows
          float cell=hash(floor(q*1.3));
          float blink=.5+.5*sin(t*(3.+cell*5.)+cell*40.);
          float dots=smoothstep(.74,.95,noise(q*1.3+vec2(t*.6,t*.4)))*blink*mix(.55,1.1,gust);
          float sp=pow(s,110.)*dots*2.6*(1.-max(shW,shBed));
          sp*=1.-smoothstep(250.,700.,dist);
          col=mix(col,vec3(1.,.97,.9),min(sp,1.)*.85);
        }

        col=mix(col,uFog,smoothstep(uNear,uFar,dist));
        gl_FragColor=vec4(col,1.);
      }`
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3200,3200), seaMat);
  sea.rotation.x = -Math.PI/2;
  scene.add(sea);

/* ==================================================================
   F. 雲（本体 1192–1238行）
   キャンバスのグラデーションでなく画素を直接書いて作る。
   iOS では透明に近いキャンバス画素が虹色の点々に崩れるため（旧試作の雲が砂嵐になった原因）。
   時間帯に合わせて SpriteMaterial の color を変える。窓の画角に入る位置へ配置し直すこと。
================================================================== */

  /* ---- clouds: painted washes. built as raw pixels, not canvas
     gradients: iOS stores near-transparent canvas pixels premultiplied and
     un-premultiplies them into rainbow speckle. ---- */
  const cloudMats = [];
  const cn = (x,y,sd)=>{            // cheap value-noise fbm for the bitmap
    let v=0,a=.5,f=1;
    for(let o=0;o<4;o++){
      const X=x*f+sd*13.1, Y=y*f+sd*7.7, xi=Math.floor(X), yi=Math.floor(Y);
      const fx=X-xi, fy=Y-yi, u=fx*fx*(3-2*fx), w=fy*fy*(3-2*fy);
      const h=(p,q)=>{ const t=Math.sin(p*127.1+q*311.7)*43758.5453; return t-Math.floor(t); };
      v+=a*((h(xi,yi)*(1-u)+h(xi+1,yi)*u)*(1-w)+(h(xi,yi+1)*(1-u)+h(xi+1,yi+1)*u)*w);
      a*=.5; f*=2;
    }
    return v;
  };
  for(let k=0;k<4;k++){
    const W=256,H=128, px=new Uint8Array(W*H*4);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const nx=(x-W/2)/(W/2), ny=(y-H*.62)/(H*.5);
      // flat-bottomed, lumpy-topped mass
      let body = 1 - (nx*nx + (ny<0? ny*ny*.9 : ny*ny*4.0));
      body += (cn(x/40,y/40,k)-.5)*1.1;
      const d = Math.min(1, Math.max(0, body*2.2));
      // watercolour: pigment gathers at the edge of the wash
      const rim = Math.max(0, 1-Math.abs(body-.08)/.08);
      // fade to nothing at the bitmap border: the noise can push the wash out
      // to the edge, and without this the sprite shows as a hard straight cut
      const ex = Math.min(x, W-1-x)/(W*.12), ey = Math.min(y, H-1-y)/(H*.12);
      const edge = Math.min(1, ex)*Math.min(1, ey);
      const al = (d*.55 + rim*.25) * edge*edge*(3-2*edge);
      const shade = 1 - rim*.08 - Math.max(0,ny)*.06;   // bellies a touch darker
      const o=((H-1-y)*W+x)*4;   // DataTexture row 0 is the bottom
      px[o]=255*shade; px[o+1]=250*shade; px[o+2]=240*shade; px[o+3]=Math.min(255,al*255);
    }
    const t=new THREE.DataTexture(px,W,H); t.colorSpace=THREE.SRGBColorSpace;
    t.magFilter=THREE.LinearFilter; t.minFilter=THREE.LinearFilter; t.needsUpdate=true;
    cloudMats.push(new THREE.SpriteMaterial({map:t, color:S.cloud, transparent:true, depthWrite:false, opacity:.85}));
  }
  const clouds = [];
  for(let i=0;i<40;i++){
    const c=new THREE.Sprite(cloudMats[i%4]);
    const a=Math.random()*Math.PI*2, r=80+Math.random()*950;
    c.position.set(Math.cos(a)*r, 55+Math.random()*140, Math.sin(a)*r);
    const w=60+Math.random()*110; c.scale.set(w, w*.5, 1);
    c.userData.v = 0.6+Math.random()*0.8;       // slow drift
    scene.add(c); clouds.push(c);
  }

/* ==================================================================
   G. 毎フレームの更新（本体 1544–1563行の抜粋）
   波紋・影・浅瀬に関わる行は不要。残すのは uT の進行、雲の流れ、空と遠山のカメラ追従。
================================================================== */

    update(dt, cam, focus){
      seaMat.uniforms.uT.value += dt;
      // wake: skimming low over open water drags a trail of ripples
      /* …波紋・影の処理（不要）… */
      for(const c of clouds) c.position.x += c.userData.v*dt;
      sky.position.copy(cam.position);
      hills.position.set(cam.position.x, 0, cam.position.z);
      sea.position.set(focus.x, 0, focus.z);
    }

/* ==================================================================
   H. 首の向き（本体 1576–1601, 1987–1993, 2416–2433, 4019–4023行）
   首4割・頭6割で向きを変える。Maya の関節の向き（X が骨の向き）のせいで、
   ローカル軸で回すと首がねじれるため、モデルの縦横の軸を親の空間へ換算して回している。
   アニメの再生処理は値の変わらない骨に書き込まないので、毎フレーム元の姿勢に戻してから
   mixer.update → 上乗せ、の順にしないと回転が積み重なって首が回り続ける。
   羽結びでは飛行の差分から角度を作っている。窓辺では「見たい地点」から角度を作り、
   首をかしげる回転（前後軸まわり）を追加する。
================================================================== */


let mixer=null, clips={}, current=null, model=null;

/* neck aim, layered over the clips.
   the mixer skips writing a bone whose value didn't change since last
   frame, so the offset must be stripped before every mixer update or it
   compounds and spins. neckClip always holds the clean clip pose. */
let neck=null, neckPitch=0, neckYaw=0;
const neckClip = new THREE.Quaternion();
let head=null;
const headClip = new THREE.Quaternion();
const NECK_SHARE = 0.4, HEAD_SHARE = 0.6;   // neck bends, head finishes the look
const nq = new THREE.Quaternion();
const _pw = new THREE.Quaternion(), _mw = new THREE.Quaternion();
const _ax = new THREE.Vector3();
/* the neck's own local axes follow Maya's joint orient (X runs along the
   bone), so spinning about local X twists the head sideways. instead take
   the model's lateral / up axes, carry them into the neck's parent space,
   and rotate about those: pitch is always pitch, yaw is always yaw. */
function boneTurn(bone, modelAxis, angle){
  model.getWorldQuaternion(_mw);
  bone.parent.getWorldQuaternion(_pw).invert();
  _ax.copy(modelAxis).applyQuaternion(_mw).applyQuaternion(_pw).normalize();
  nq.setFromAxisAngle(_ax, angle);
  bone.quaternion.premultiply(nq);
}

/* --- モデル読み込み時（本体 1987–1993行） --- */

    neck = null; head = null;
    model.traverse(o=>{
      if(!neck && o.name==='neck') neck = o;
      if(!head && o.name==='head') head = o;
    });
    if(neck) neckClip.copy(neck.quaternion);

/* --- 毎フレーム：首の上乗せ（本体 2416–2433行） --- */
  // neck straightens back along the body. same for descending.
  if(neck){
    const lead  = grounded ? 0 : THREE.MathUtils.clamp((targetY - V.y)*0.07, -0.45, 0.45);
    const wantY = grounded ? 0 :  roll*0.30;   // look into the turn
    neckPitch += (lead  - neckPitch) * Math.min(1, 5.0*dt);
    neckYaw   += (wantY - neckYaw)   * Math.min(1, 2.6*dt);

    neckClip.copy(neck.quaternion);            // clean pose from the mixer
    if(head) headClip.copy(head.quaternion);
    const ns = head ? NECK_SHARE : 1.0;
    // +θ about the lateral axis tips the beak down, same as the body
    boneTurn(neck, M_X, -neckPitch*ns);
    boneTurn(neck, M_Y,  neckYaw  *ns);
    if(head){
      boneTurn(head, M_X, -neckPitch*HEAD_SHARE);
      boneTurn(head, M_Y,  neckYaw  *HEAD_SHARE);
    }
  }

/* --- ループ：mixer.update の直前に元の姿勢へ戻す（本体 4019–4023行） --- */
  // photo mode and the settings sheet stop time: nothing steps, the pose holds
  if(mixer && !photo && !settingsOpen && !zOpen){
    if(neck) neck.quaternion.copy(neckClip);
    if(head) head.quaternion.copy(headClip);
    mixer.update(dt);

/* ==================================================================
   I. 音符（本体 2700–2760行）
   白い音符PNGを、音名（ピッチクラス12色）でコードが彩色する。乗算ではなく明度で塗り分け、
   紙の白→淡いパステル、灰色の陰影→同じ色相の深い色。
   NOTE_IMG は本体では base64 の埋め込み。ここでは中身を省略した。
   こちらでは assets/notes/ の PNG を読み込む。
================================================================== */

/* ============ floating notes ============ */
const NOTE_IMG = { /* assets/notes/ の PNG（本体では base64 埋め込み。省略） */ };
let noteTex = Object.values(NOTE_IMG).map(src=>{
  const t = new THREE.TextureLoader().load(src); t.colorSpace = THREE.SRGBColorSpace; return t;
});
// one watercolour hue per pitch class, soft enough to sit on the paper
const NOTE_COL = [0xe58f7a,0xe9a46a,0xe8c15e,0xa9c46c,0x72b89a,0x6fb0c4,
                  0x7d9ad6,0x9f8ad6,0xc486c8,0xde88a8,0xd99a8a,0xb8a27a];
const notes = [];
for(let i=0;i<48;i++){
  const nm = new THREE.SpriteMaterial({map:noteTex[i%noteTex.length], transparent:true, depthWrite:false, fog:false});
  // tint by value instead of multiply: the white paper goes to a pale pastel of the hue,
  // the grey watercolour shading to a deeper tone of the same hue (a multiply turned it muddy)
  nm.userData.dim = {value:1};
  nm.onBeforeCompile = sh=>{
    sh.uniforms.uDim = nm.userData.dim;
    sh.fragmentShader = 'uniform float uDim;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 tx = texture2D(map, vMapUv);
      float L = dot(tx.rgb, vec3(.299,.587,.114));
      vec3 lite = mix(diffuse, vec3(1.), .42);
      vec3 deep = mix(diffuse, vec3(1.), .08) * .9;
      vec3 nc = mix(deep, lite, smoothstep(.25, .95, L)) * uDim;
      // darker ones get a little more chroma back so they stay clear, not grey
      float nl = dot(nc, vec3(.2126,.7152,.0722));
      nc = max(vec3(0.), mix(vec3(nl), nc, 1. + (1. - uDim)*1.6));
      diffuseColor = vec4(nc, opacity * tx.a);`);
  };
  nm.customProgramCacheKey = ()=>'noteTint';
  const sp = new THREE.Sprite(nm);
  sp.visible = false; sp.userData = {life:0, v:new THREE.Vector3(), ph:0};
  scene.add(sp); notes.push(sp);
}
let noteNext = 0;
function emitNote(pos, midi, big=1){
  const sp = notes[noteNext]; noteNext = (noteNext+1)%notes.length;
  sp.material.map = noteTex[Math.floor(Math.random()*noteTex.length)];
  sp.material.color.setHex(NOTE_COL[((midi%12)+12)%12]);
  sp.position.copy(pos);
  sp.userData.life = 1.6; sp.userData.max = 1.6; sp.userData.ph = Math.random()*6;
  sp.userData.v.set((Math.random()-.5)*.8, 1.3+Math.random()*.5, (Math.random()-.5)*.8);
  sp.userData.s = .5*big*(.8 + .2*Math.random());            // 0.8–1 of full size
  sp.material.rotation = (Math.random()*2-1) * Math.PI/6;      // ±30°
  sp.material.userData.dim.value = 1 - .2*Math.random();         // up to 20% darker
  sp.visible = true;
}
function updateNotes(dt, drift){
  for(const sp of notes){
    const u = sp.userData;
    if(!sp.visible) continue;
    u.life -= dt;
    if(u.life <= 0){ sp.visible = false; continue; }
    const k = 1 - u.life/u.max;
    sp.position.addScaledVector(u.v, dt);
    if(drift) sp.position.addScaledVector(drift, dt*0.55);    // trail behind a moving singer
    sp.position.x += Math.sin(u.ph + k*9)*dt*.35;
    const pop = Math.min(1, k*6);
    sp.scale.setScalar(u.s*(.6+.4*pop));
    sp.material.opacity = Math.min(1, u.life*1.6) * .95;
  }
}
