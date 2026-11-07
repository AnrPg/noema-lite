/* ===================== interactive activities — geom@1, 2-D Euclidean constructions (docs/library/geom.md, docs/INTERACTIVE_LIBRARY.md §1) =====================
   A general engine of the library: a construction as a dependency DAG (like GeoGebra or Cinderella) — free points bound to the
   spec's params, points on objects, intersections that are classified (tangent, parallel, coincident, none), triangle centres
   (Kimberling's ETC), circles, conics, transformations (isometries, similarities, affine and projective maps, inversion), loci over a
   sweep, computational geometry (hull, Delaunay, Voronoi, minimum enclosing circle, clipping) and the Poincaré disk — with measures
   and tolerant asserts as scalars, measures against the sweep as series, and the construction as a scene.
   Robust structure: orientation and in-circle decisions use Shewchuk's adaptive exact predicates (Shewchuk 1997, Discrete Comput.
   Geom. 18:305) as vendored robust-predicates@3.0.3 (public domain, engine/vendor/robust-predicates@3.0.3, ~13 kB), embedded below
   verbatim; tolerant decisions use a scale S of the free points (research §4.3). Every object is rebuilt from the free points along
   the DAG on every run (no drift). Pure JS, no DOM, no words: numbers, codes, keys and the model's own ids (`s`).
   Python twin of checkSpec / exprs / keys: tools/lib_geom.py. Tests: node tests/lib_geom.js, node tests/enginelib.js. */
(function noemaLibGeomModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes, keys and numbers leave this engine
  'use strict';
  const C = root.NoemaLibCore;
  const ID = 'geom@1';
  const MAX_OBJ = 300, MAX_SET = 200, BUDGET = 200000;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const FN = n => (root.NoemaExpr && root.NoemaExpr.FUNCS && root.NoemaExpr.FUNCS[n] ? root.NoemaExpr.FUNCS[n].fn : Math[n]);
  const sin = FN('sin'), cos = FN('cos'), atan2 = FN('atan2'), cosh = FN('cosh'), sinh = FN('sinh'), acosh = x => FN('log')(x + Math.sqrt(x * x - 1)), cbrt = FN('cbrt');
  const sqrt = Math.sqrt, abs = Math.abs, hypot = (x, y) => { const a = abs(x), b = abs(y), m = Math.max(a, b); if (m === 0) return 0; const p = a / m, q = b / m; return m * sqrt(p * p + q * q); };
  const PI = 3.141592653589793;

  /* ---------- the vendored exact predicates: robust-predicates@3.0.3 (V. Agafonkin; Unlicense), umd/orient2d.min.js + umd/incircle.min.js verbatim ---------- */
  const RP = (function robustPredicates() {
    const exports = {}, module = {};   // the UMD files take their CommonJS branch and fill `exports`
    /* vendor:orient2d.min.js */!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?e(exports):"function"==typeof define&&define.amd?define(["exports"],e):e((t="undefined"!=typeof globalThis?globalThis:t||self).predicates={})}(this,function(t){"use strict";const e=11102230246251565e-32,n=134217729,o=(3+8*e)*e;function r(t,e,n,o,r){let f,i,u,s,c=e[0],a=o[0],l=0,d=0;a>c==a>-c?(f=c,c=e[++l]):(f=a,a=o[++d]);let p=0;if(l<t&&d<n)for(a>c==a>-c?(i=c+f,u=f-(i-c),c=e[++l]):(i=a+f,u=f-(i-a),a=o[++d]),f=i,0!==u&&(r[p++]=u);l<t&&d<n;)a>c==a>-c?(i=f+c,s=i-f,u=f-(i-s)+(c-s),c=e[++l]):(i=f+a,s=i-f,u=f-(i-s)+(a-s),a=o[++d]),f=i,0!==u&&(r[p++]=u);for(;l<t;)i=f+c,s=i-f,u=f-(i-s)+(c-s),c=e[++l],f=i,0!==u&&(r[p++]=u);for(;d<n;)i=f+a,s=i-f,u=f-(i-s)+(a-s),a=o[++d],f=i,0!==u&&(r[p++]=u);return 0===f&&0!==p||(r[p++]=f),p}function f(t){return new Float64Array(t)}const i=f(4),u=f(8),s=f(12),c=f(16),a=f(4);t.orient2d=function(t,e,f,l,d,p){const b=(e-p)*(f-d),h=(t-d)*(l-p),y=b-h,x=Math.abs(b+h);return Math.abs(y)>=33306690738754716e-32*x?y:-function(t,e,f,l,d,p,b){let h,y,x,M,g,m,T,j,w,A,F,k,q,v,z,B,C,D;const E=t-d,G=f-d,H=e-p,I=l-p;v=E*I,m=n*E,T=m-(m-E),j=E-T,m=n*I,w=m-(m-I),A=I-w,z=j*A-(v-T*w-j*w-T*A),B=H*G,m=n*H,T=m-(m-H),j=H-T,m=n*G,w=m-(m-G),A=G-w,C=j*A-(B-T*w-j*w-T*A),F=z-C,g=z-F,i[0]=z-(F+g)+(g-C),k=v+F,g=k-v,q=v-(k-g)+(F-g),F=q-B,g=q-F,i[1]=q-(F+g)+(g-B),D=k+F,g=D-k,i[2]=k-(D-g)+(F-g),i[3]=D;let J=function(t,e){let n=e[0];for(let o=1;o<t;o++)n+=e[o];return n}(4,i),K=22204460492503146e-32*b;if(J>=K||-J>=K)return J;if(g=t-E,h=t-(E+g)+(g-d),g=f-G,x=f-(G+g)+(g-d),g=e-H,y=e-(H+g)+(g-p),g=l-I,M=l-(I+g)+(g-p),0===h&&0===y&&0===x&&0===M)return J;if(K=11093356479670487e-47*b+o*Math.abs(J),J+=E*M+I*h-(H*x+G*y),J>=K||-J>=K)return J;v=h*I,m=n*h,T=m-(m-h),j=h-T,m=n*I,w=m-(m-I),A=I-w,z=j*A-(v-T*w-j*w-T*A),B=y*G,m=n*y,T=m-(m-y),j=y-T,m=n*G,w=m-(m-G),A=G-w,C=j*A-(B-T*w-j*w-T*A),F=z-C,g=z-F,a[0]=z-(F+g)+(g-C),k=v+F,g=k-v,q=v-(k-g)+(F-g),F=q-B,g=q-F,a[1]=q-(F+g)+(g-B),D=k+F,g=D-k,a[2]=k-(D-g)+(F-g),a[3]=D;const L=r(4,i,4,a,u);v=E*M,m=n*E,T=m-(m-E),j=E-T,m=n*M,w=m-(m-M),A=M-w,z=j*A-(v-T*w-j*w-T*A),B=H*x,m=n*H,T=m-(m-H),j=H-T,m=n*x,w=m-(m-x),A=x-w,C=j*A-(B-T*w-j*w-T*A),F=z-C,g=z-F,a[0]=z-(F+g)+(g-C),k=v+F,g=k-v,q=v-(k-g)+(F-g),F=q-B,g=q-F,a[1]=q-(F+g)+(g-B),D=k+F,g=D-k,a[2]=k-(D-g)+(F-g),a[3]=D;const N=r(L,u,4,a,s);v=h*M,m=n*h,T=m-(m-h),j=h-T,m=n*M,w=m-(m-M),A=M-w,z=j*A-(v-T*w-j*w-T*A),B=y*x,m=n*y,T=m-(m-y),j=y-T,m=n*x,w=m-(m-x),A=x-w,C=j*A-(B-T*w-j*w-T*A),F=z-C,g=z-F,a[0]=z-(F+g)+(g-C),k=v+F,g=k-v,q=v-(k-g)+(F-g),F=q-B,g=q-F,a[1]=q-(F+g)+(g-B),D=k+F,g=D-k,a[2]=k-(D-g)+(F-g),a[3]=D;const O=r(N,s,4,a,c);return c[O-1]}(t,e,f,l,d,p,x)},t.orient2dfast=function(t,e,n,o,r,f){return(e-f)*(n-r)-(t-r)*(o-f)}});
    /* vendor:incircle.min.js */!function(t,n){"object"==typeof exports&&"undefined"!=typeof module?n(exports):"function"==typeof define&&define.amd?define(["exports"],n):n((t="undefined"!=typeof globalThis?globalThis:t||self).predicates={})}(this,function(t){"use strict";const n=11102230246251565e-32,e=134217729,o=(3+8*n)*n;function f(t,n,e,o,f){let i,r,c,s,u=n[0],a=o[0],l=0,b=0;a>u==a>-u?(i=u,u=n[++l]):(i=a,a=o[++b]);let d=0;if(l<t&&b<e)for(a>u==a>-u?(r=u+i,c=i-(r-u),u=n[++l]):(r=a+i,c=i-(r-a),a=o[++b]),i=r,0!==c&&(f[d++]=c);l<t&&b<e;)a>u==a>-u?(r=i+u,s=r-i,c=i-(r-s)+(u-s),u=n[++l]):(r=i+a,s=r-i,c=i-(r-s)+(a-s),a=o[++b]),i=r,0!==c&&(f[d++]=c);for(;l<t;)r=i+u,s=r-i,c=i-(r-s)+(u-s),u=n[++l],i=r,0!==c&&(f[d++]=c);for(;b<e;)r=i+a,s=r-i,c=i-(r-s)+(a-s),a=o[++b],i=r,0!==c&&(f[d++]=c);return 0===i&&0!==d||(f[d++]=i),d}function i(t,n,e,o,i,r,c,s){return f(f(t,n,e,o,c),c,i,r,s)}function r(t,n,o,f){let i,r,c,s,u,a,l,b,d,h,p;l=e*o,h=l-(l-o),p=o-h;let M=n[0];i=M*o,l=e*M,b=l-(l-M),d=M-b,c=d*p-(i-b*h-d*h-b*p);let y=0;0!==c&&(f[y++]=c);for(let x=1;x<t;x++)M=n[x],s=M*o,l=e*M,b=l-(l-M),d=M-b,u=d*p-(s-b*h-d*h-b*p),r=i+u,a=r-i,c=i-(r-a)+(u-a),0!==c&&(f[y++]=c),i=s+r,c=r-(i-s),0!==c&&(f[y++]=c);return 0===i&&0!==y||(f[y++]=i),y}function c(t){return new Float64Array(t)}const s=c(4),u=c(4),a=c(4),l=c(4),b=c(4),d=c(4),h=c(4),p=c(4),M=c(8),y=c(8),x=c(8),g=c(8),m=c(8),T=c(8),j=c(8),w=c(8),A=c(8),F=c(4),k=c(4),q=c(4),v=c(8),z=c(16),B=c(16),C=c(16),D=c(32),E=c(32),G=c(48),H=c(64);let I=c(1152),J=c(1152);function K(t,n,e){t=f(t,I,n,e,J);const o=I;return I=J,J=o,t}t.incircle=function(t,n,c,J,L,N,O,P){const Q=t-O,R=c-O,S=L-O,U=n-P,V=J-P,W=N-P,X=R*W,Y=S*V,Z=Q*Q+U*U,$=S*U,_=Q*W,tt=R*R+V*V,nt=Q*V,et=R*U,ot=S*S+W*W,ft=Z*(X-Y)+tt*($-_)+ot*(nt-et),it=(Math.abs(X)+Math.abs(Y))*Z+(Math.abs($)+Math.abs(_))*tt+(Math.abs(nt)+Math.abs(et))*ot,rt=11102230246251577e-31*it;return ft>rt||-ft>rt?ft:function(t,n,c,J,L,N,O,P,Q){let R,S,U,V,W,X,Y,Z,$,_,tt,nt,et,ot,ft,it,rt,ct,st,ut,at,lt,bt,dt,ht,pt,Mt,yt,xt,gt,mt,Tt,jt,wt,At;const Ft=t-O,kt=c-O,qt=L-O,vt=n-P,zt=J-P,Bt=N-P;mt=kt*Bt,bt=e*kt,dt=bt-(bt-kt),ht=kt-dt,bt=e*Bt,pt=bt-(bt-Bt),Mt=Bt-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=qt*zt,bt=e*qt,dt=bt-(bt-qt),ht=qt-dt,bt=e*zt,pt=bt-(bt-zt),Mt=zt-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt-wt,lt=Tt-yt,s[0]=Tt-(yt+lt)+(lt-wt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt-jt,lt=gt-yt,s[1]=gt-(yt+lt)+(lt-jt),At=xt+yt,lt=At-xt,s[2]=xt-(At-lt)+(yt-lt),s[3]=At,mt=qt*vt,bt=e*qt,dt=bt-(bt-qt),ht=qt-dt,bt=e*vt,pt=bt-(bt-vt),Mt=vt-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=Ft*Bt,bt=e*Ft,dt=bt-(bt-Ft),ht=Ft-dt,bt=e*Bt,pt=bt-(bt-Bt),Mt=Bt-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt-wt,lt=Tt-yt,u[0]=Tt-(yt+lt)+(lt-wt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt-jt,lt=gt-yt,u[1]=gt-(yt+lt)+(lt-jt),At=xt+yt,lt=At-xt,u[2]=xt-(At-lt)+(yt-lt),u[3]=At,mt=Ft*zt,bt=e*Ft,dt=bt-(bt-Ft),ht=Ft-dt,bt=e*zt,pt=bt-(bt-zt),Mt=zt-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=kt*vt,bt=e*kt,dt=bt-(bt-kt),ht=kt-dt,bt=e*vt,pt=bt-(bt-vt),Mt=vt-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt-wt,lt=Tt-yt,a[0]=Tt-(yt+lt)+(lt-wt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt-jt,lt=gt-yt,a[1]=gt-(yt+lt)+(lt-jt),At=xt+yt,lt=At-xt,a[2]=xt-(At-lt)+(yt-lt),a[3]=At,R=f(f(f(r(r(4,s,Ft,v),v,Ft,z),z,r(r(4,s,vt,v),v,vt,B),B,D),D,f(r(r(4,u,kt,v),v,kt,z),z,r(r(4,u,zt,v),v,zt,B),B,E),E,H),H,f(r(r(4,a,qt,v),v,qt,z),z,r(r(4,a,Bt,v),v,Bt,B),B,D),D,I);let Ct=function(t,n){let e=n[0];for(let o=1;o<t;o++)e+=n[o];return e}(R,I),Dt=4440892098500632e-31*Q;if(Ct>=Dt||-Ct>=Dt)return Ct;if(lt=t-Ft,S=t-(Ft+lt)+(lt-O),lt=n-vt,W=n-(vt+lt)+(lt-P),lt=c-kt,U=c-(kt+lt)+(lt-O),lt=J-zt,X=J-(zt+lt)+(lt-P),lt=L-qt,V=L-(qt+lt)+(lt-O),lt=N-Bt,Y=N-(Bt+lt)+(lt-P),0===S&&0===U&&0===V&&0===W&&0===X&&0===Y)return Ct;if(Dt=5423418723394464e-46*Q+o*Math.abs(Ct),Ct+=(Ft*Ft+vt*vt)*(kt*Y+Bt*U-(zt*V+qt*X))+2*(Ft*S+vt*W)*(kt*Bt-zt*qt)+((kt*kt+zt*zt)*(qt*W+vt*V-(Bt*S+Ft*Y))+2*(kt*U+zt*X)*(qt*vt-Bt*Ft))+((qt*qt+Bt*Bt)*(Ft*X+zt*S-(vt*U+kt*W))+2*(qt*V+Bt*Y)*(Ft*zt-vt*kt)),Ct>=Dt||-Ct>=Dt)return Ct;if(0===U&&0===X&&0===V&&0===Y||(mt=Ft*Ft,bt=e*Ft,dt=bt-(bt-Ft),ht=Ft-dt,Tt=ht*ht-(mt-dt*dt-(dt+dt)*ht),jt=vt*vt,bt=e*vt,dt=bt-(bt-vt),ht=vt-dt,wt=ht*ht-(jt-dt*dt-(dt+dt)*ht),yt=Tt+wt,lt=yt-Tt,l[0]=Tt-(yt-lt)+(wt-lt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt+jt,lt=yt-gt,l[1]=gt-(yt-lt)+(jt-lt),At=xt+yt,lt=At-xt,l[2]=xt-(At-lt)+(yt-lt),l[3]=At),0===V&&0===Y&&0===S&&0===W||(mt=kt*kt,bt=e*kt,dt=bt-(bt-kt),ht=kt-dt,Tt=ht*ht-(mt-dt*dt-(dt+dt)*ht),jt=zt*zt,bt=e*zt,dt=bt-(bt-zt),ht=zt-dt,wt=ht*ht-(jt-dt*dt-(dt+dt)*ht),yt=Tt+wt,lt=yt-Tt,b[0]=Tt-(yt-lt)+(wt-lt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt+jt,lt=yt-gt,b[1]=gt-(yt-lt)+(jt-lt),At=xt+yt,lt=At-xt,b[2]=xt-(At-lt)+(yt-lt),b[3]=At),0===S&&0===W&&0===U&&0===X||(mt=qt*qt,bt=e*qt,dt=bt-(bt-qt),ht=qt-dt,Tt=ht*ht-(mt-dt*dt-(dt+dt)*ht),jt=Bt*Bt,bt=e*Bt,dt=bt-(bt-Bt),ht=Bt-dt,wt=ht*ht-(jt-dt*dt-(dt+dt)*ht),yt=Tt+wt,lt=yt-Tt,d[0]=Tt-(yt-lt)+(wt-lt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt+jt,lt=yt-gt,d[1]=gt-(yt-lt)+(jt-lt),At=xt+yt,lt=At-xt,d[2]=xt-(At-lt)+(yt-lt),d[3]=At),0!==S&&(Z=r(4,s,S,M),R=K(R,i(r(Z,M,2*Ft,z),z,r(r(4,d,S,v),v,zt,B),B,r(r(4,b,S,v),v,-Bt,C),C,D,G),G)),0!==W&&($=r(4,s,W,y),R=K(R,i(r($,y,2*vt,z),z,r(r(4,b,W,v),v,qt,B),B,r(r(4,d,W,v),v,-kt,C),C,D,G),G)),0!==U&&(_=r(4,u,U,x),R=K(R,i(r(_,x,2*kt,z),z,r(r(4,l,U,v),v,Bt,B),B,r(r(4,d,U,v),v,-vt,C),C,D,G),G)),0!==X&&(tt=r(4,u,X,g),R=K(R,i(r(tt,g,2*zt,z),z,r(r(4,d,X,v),v,Ft,B),B,r(r(4,l,X,v),v,-qt,C),C,D,G),G)),0!==V&&(nt=r(4,a,V,m),R=K(R,i(r(nt,m,2*qt,z),z,r(r(4,b,V,v),v,vt,B),B,r(r(4,l,V,v),v,-zt,C),C,D,G),G)),0!==Y&&(et=r(4,a,Y,T),R=K(R,i(r(et,T,2*Bt,z),z,r(r(4,l,Y,v),v,kt,B),B,r(r(4,b,Y,v),v,-Ft,C),C,D,G),G)),0!==S||0!==W){if(0!==U||0!==X||0!==V||0!==Y?(mt=U*Bt,bt=e*U,dt=bt-(bt-U),ht=U-dt,bt=e*Bt,pt=bt-(bt-Bt),Mt=Bt-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=kt*Y,bt=e*kt,dt=bt-(bt-kt),ht=kt-dt,bt=e*Y,pt=bt-(bt-Y),Mt=Y-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt+wt,lt=yt-Tt,h[0]=Tt-(yt-lt)+(wt-lt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt+jt,lt=yt-gt,h[1]=gt-(yt-lt)+(jt-lt),At=xt+yt,lt=At-xt,h[2]=xt-(At-lt)+(yt-lt),h[3]=At,mt=V*-zt,bt=e*V,dt=bt-(bt-V),ht=V-dt,bt=e*-zt,pt=bt-(bt- -zt),Mt=-zt-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=qt*-X,bt=e*qt,dt=bt-(bt-qt),ht=qt-dt,bt=e*-X,pt=bt-(bt- -X),Mt=-X-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt+wt,lt=yt-Tt,p[0]=Tt-(yt-lt)+(wt-lt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt+jt,lt=yt-gt,p[1]=gt-(yt-lt)+(jt-lt),At=xt+yt,lt=At-xt,p[2]=xt-(At-lt)+(yt-lt),p[3]=At,ft=f(4,h,4,p,w),mt=U*Y,bt=e*U,dt=bt-(bt-U),ht=U-dt,bt=e*Y,pt=bt-(bt-Y),Mt=Y-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=V*X,bt=e*V,dt=bt-(bt-V),ht=V-dt,bt=e*X,pt=bt-(bt-X),Mt=X-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt-wt,lt=Tt-yt,k[0]=Tt-(yt+lt)+(lt-wt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt-jt,lt=gt-yt,k[1]=gt-(yt+lt)+(lt-jt),At=xt+yt,lt=At-xt,k[2]=xt-(At-lt)+(yt-lt),k[3]=At,ct=4):(w[0]=0,ft=1,k[0]=0,ct=1),0!==S){const t=r(ft,w,S,C);R=K(R,f(r(Z,M,S,z),z,r(t,C,2*Ft,D),D,G),G);const n=r(ct,k,S,v);R=K(R,i(r(n,v,2*Ft,z),z,r(n,v,S,B),B,r(t,C,S,D),D,E,H),H),0!==X&&(R=K(R,r(r(4,d,S,v),v,X,z),z)),0!==Y&&(R=K(R,r(r(4,b,-S,v),v,Y,z),z))}if(0!==W){const t=r(ft,w,W,C);R=K(R,f(r($,y,W,z),z,r(t,C,2*vt,D),D,G),G);const n=r(ct,k,W,v);R=K(R,i(r(n,v,2*vt,z),z,r(n,v,W,B),B,r(t,C,W,D),D,E,H),H)}}if(0!==U||0!==X){if(0!==V||0!==Y||0!==S||0!==W?(mt=V*vt,bt=e*V,dt=bt-(bt-V),ht=V-dt,bt=e*vt,pt=bt-(bt-vt),Mt=vt-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=qt*W,bt=e*qt,dt=bt-(bt-qt),ht=qt-dt,bt=e*W,pt=bt-(bt-W),Mt=W-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt+wt,lt=yt-Tt,h[0]=Tt-(yt-lt)+(wt-lt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt+jt,lt=yt-gt,h[1]=gt-(yt-lt)+(jt-lt),At=xt+yt,lt=At-xt,h[2]=xt-(At-lt)+(yt-lt),h[3]=At,ut=-Bt,at=-Y,mt=S*ut,bt=e*S,dt=bt-(bt-S),ht=S-dt,bt=e*ut,pt=bt-(bt-ut),Mt=ut-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=Ft*at,bt=e*Ft,dt=bt-(bt-Ft),ht=Ft-dt,bt=e*at,pt=bt-(bt-at),Mt=at-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt+wt,lt=yt-Tt,p[0]=Tt-(yt-lt)+(wt-lt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt+jt,lt=yt-gt,p[1]=gt-(yt-lt)+(jt-lt),At=xt+yt,lt=At-xt,p[2]=xt-(At-lt)+(yt-lt),p[3]=At,it=f(4,h,4,p,A),mt=V*W,bt=e*V,dt=bt-(bt-V),ht=V-dt,bt=e*W,pt=bt-(bt-W),Mt=W-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=S*Y,bt=e*S,dt=bt-(bt-S),ht=S-dt,bt=e*Y,pt=bt-(bt-Y),Mt=Y-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt-wt,lt=Tt-yt,q[0]=Tt-(yt+lt)+(lt-wt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt-jt,lt=gt-yt,q[1]=gt-(yt+lt)+(lt-jt),At=xt+yt,lt=At-xt,q[2]=xt-(At-lt)+(yt-lt),q[3]=At,st=4):(A[0]=0,it=1,q[0]=0,st=1),0!==U){const t=r(it,A,U,C);R=K(R,f(r(_,x,U,z),z,r(t,C,2*kt,D),D,G),G);const n=r(st,q,U,v);R=K(R,i(r(n,v,2*kt,z),z,r(n,v,U,B),B,r(t,C,U,D),D,E,H),H),0!==Y&&(R=K(R,r(r(4,l,U,v),v,Y,z),z)),0!==W&&(R=K(R,r(r(4,d,-U,v),v,W,z),z))}if(0!==X){const t=r(it,A,X,C);R=K(R,f(r(tt,g,X,z),z,r(t,C,2*zt,D),D,G),G);const n=r(st,q,X,v);R=K(R,i(r(n,v,2*zt,z),z,r(n,v,X,B),B,r(t,C,X,D),D,E,H),H)}}if(0!==V||0!==Y){if(0!==S||0!==W||0!==U||0!==X?(mt=S*zt,bt=e*S,dt=bt-(bt-S),ht=S-dt,bt=e*zt,pt=bt-(bt-zt),Mt=zt-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=Ft*X,bt=e*Ft,dt=bt-(bt-Ft),ht=Ft-dt,bt=e*X,pt=bt-(bt-X),Mt=X-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt+wt,lt=yt-Tt,h[0]=Tt-(yt-lt)+(wt-lt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt+jt,lt=yt-gt,h[1]=gt-(yt-lt)+(jt-lt),At=xt+yt,lt=At-xt,h[2]=xt-(At-lt)+(yt-lt),h[3]=At,ut=-vt,at=-W,mt=U*ut,bt=e*U,dt=bt-(bt-U),ht=U-dt,bt=e*ut,pt=bt-(bt-ut),Mt=ut-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=kt*at,bt=e*kt,dt=bt-(bt-kt),ht=kt-dt,bt=e*at,pt=bt-(bt-at),Mt=at-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt+wt,lt=yt-Tt,p[0]=Tt-(yt-lt)+(wt-lt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt+jt,lt=yt-gt,p[1]=gt-(yt-lt)+(jt-lt),At=xt+yt,lt=At-xt,p[2]=xt-(At-lt)+(yt-lt),p[3]=At,ot=f(4,h,4,p,j),mt=S*X,bt=e*S,dt=bt-(bt-S),ht=S-dt,bt=e*X,pt=bt-(bt-X),Mt=X-pt,Tt=ht*Mt-(mt-dt*pt-ht*pt-dt*Mt),jt=U*W,bt=e*U,dt=bt-(bt-U),ht=U-dt,bt=e*W,pt=bt-(bt-W),Mt=W-pt,wt=ht*Mt-(jt-dt*pt-ht*pt-dt*Mt),yt=Tt-wt,lt=Tt-yt,F[0]=Tt-(yt+lt)+(lt-wt),xt=mt+yt,lt=xt-mt,gt=mt-(xt-lt)+(yt-lt),yt=gt-jt,lt=gt-yt,F[1]=gt-(yt+lt)+(lt-jt),At=xt+yt,lt=At-xt,F[2]=xt-(At-lt)+(yt-lt),F[3]=At,rt=4):(j[0]=0,ot=1,F[0]=0,rt=1),0!==V){const t=r(ot,j,V,C);R=K(R,f(r(nt,m,V,z),z,r(t,C,2*qt,D),D,G),G);const n=r(rt,F,V,v);R=K(R,i(r(n,v,2*qt,z),z,r(n,v,V,B),B,r(t,C,V,D),D,E,H),H),0!==W&&(R=K(R,r(r(4,b,V,v),v,W,z),z)),0!==X&&(R=K(R,r(r(4,l,-V,v),v,X,z),z))}if(0!==Y){const t=r(ot,j,Y,C);R=K(R,f(r(et,T,Y,z),z,r(t,C,2*Bt,D),D,G),G);const n=r(rt,F,Y,v);R=K(R,i(r(n,v,2*Bt,z),z,r(n,v,Y,B),B,r(t,C,Y,D),D,E,H),H)}}return I[R-1]}(t,n,c,J,L,N,O,P,it)},t.incirclefast=function(t,n,e,o,f,i,r,c){const s=t-r,u=n-c,a=e-r,l=o-c,b=f-r,d=i-c;return(s*s+u*u)*(a*d-b*l)+(a*a+l*l)*(b*u-s*d)+(b*b+d*d)*(s*l-a*u)}});
    return exports;
  })();
  // orient(a, b, c) > 0 ⇔ a, b, c turn counter-clockwise (robust-predicates' orient2d has the opposite sign); incircle > 0 ⇔ d inside the ccw circle abc
  const orient = (ax, ay, bx, by, cx, cy) => -RP.orient2d(ax, ay, bx, by, cx, cy);
  const incircle = (ax, ay, bx, by, cx, cy, dx, dy) => RP.incircle(ax, ay, bx, by, cx, cy, dx, dy);

  /* ---------- the model format (the same tables in tools/lib_geom.py) ---------- */
  // static types: P point · L line · S segment · R ray · C circle · K conic · G polygon · U curve · T set of segments
  const TYPE_NAMES = { P: 'a point', L: 'a line', S: 'a segment', R: 'a ray', C: 'a circle', K: 'a conic', G: 'a polygon', U: 'a curve', T: 'a set' };
  const LIN = 'LSR';
  const CENTRES = ['centroid', 'incenter', 'circumcenter', 'orthocenter', 'ninepoint', 'symmedian', 'gergonne', 'nagel', 'mittenpunkt', 'spieker',
    'feuerbach', 'fermat', 'delongchamps', 'excenter-a', 'excenter-b', 'excenter-c'];
  const TRICIRCLES = ['circumcircle', 'incircle', 'ninepoint', 'excircle-a', 'excircle-b', 'excircle-c'];
  const TRANSFORMS = ['translate', 'rotate', 'reflect', 'dilate', 'invert', 'shear', 'affine', 'projective'];
  const ROLES = ['base', 'muted', 'hi', 'ok', 'bad', 'warn', 'info'];
  const PICK_RE = /^(index:[0-3]|near:[A-Za-z][A-Za-z0-9_-]{0,31}|far:[A-Za-z][A-Za-z0-9_-]{0,31}|other:[A-Za-z][A-Za-z0-9_-]{0,31}|continuous)$/;
  /* each construction: list = its value is a list of refs (types per position, the last one repeating up to max), or T = a table of
     fields (refs typed in R), and its result type (a letter, or a function of the referenced types) */
  const KINDS = {
    point: { point: true, out: 'P' },
    pointOn: { T: { on: 'ref!', t: 'numx!' }, R: { on: LIN + 'CKGU' }, out: 'P' },
    midpoint: { list: ['P', 'P'], min: 2, max: 2, out: 'P' },
    intersect: { T: { of: { $req: true, $list: 'ref', min: 2, max: 2 }, pick: 'pick' }, R: { of: [LIN + 'CK', LIN + 'CK'] }, out: 'P' },
    center: { T: { kind: 'enum:' + CENTRES.join('|') + '!', of: { $req: true, $list: 'ref', min: 3, max: 3 } }, R: { of: ['P', 'P', 'P'] }, out: 'P' },
    centerOf: { T: { of: 'ref!' }, R: { of: 'CK' }, out: 'P' },
    foot: { T: { from: 'ref!', to: 'ref!' }, R: { from: 'P', to: LIN }, out: 'P' },
    focus: { T: { of: 'ref!', index: 'int:0:1' }, R: { of: 'K' }, out: 'P' },
    line: { list: ['P', 'P'], min: 2, max: 2, out: 'L' },
    segment: { list: ['P', 'P'], min: 2, max: 2, out: 'S' },
    ray: { list: ['P', 'P'], min: 2, max: 2, out: 'R' },
    parallel: { T: { to: 'ref!', through: 'ref!' }, R: { to: LIN, through: 'P' }, out: 'L' },
    perpendicular: { T: { to: 'ref!', through: 'ref!' }, R: { to: LIN, through: 'P' }, out: 'L' },
    perpBisector: { list: ['P', 'P'], min: 2, max: 2, out: 'L' },
    angleBisector: { T: { of: { $req: true, $list: 'ref', min: 3, max: 3 }, external: 'bool' }, R: { of: ['P', 'P', 'P'] }, out: 'L' },
    tangent: { T: { from: 'ref!', to: 'ref!', pick: 'pick' }, R: { from: 'P', to: 'CK' }, out: 'L' },
    polar: { T: { of: 'ref!', to: 'ref!' }, R: { of: 'P', to: 'CK' }, out: 'L' },
    radicalAxis: { list: ['C', 'C'], min: 2, max: 2, out: 'L' },
    eulerLine: { list: ['P', 'P', 'P'], min: 3, max: 3, out: 'L' },
    simson: { T: { point: 'ref!', of: { $req: true, $list: 'ref', min: 3, max: 3 } }, R: { point: 'P', of: ['P', 'P', 'P'] }, out: 'L' },
    circle: { T: { center: 'ref', through: 'ref', r: 'numx', points: { $list: 'ref', min: 3, max: 3 } }, R: { center: 'P', through: 'P', points: ['P', 'P', 'P'] }, out: 'C' },
    triCircle: { T: { kind: 'enum:' + TRICIRCLES.join('|') + '!', of: { $req: true, $list: 'ref', min: 3, max: 3 } }, R: { of: ['P', 'P', 'P'] }, out: 'C' },
    apollonius: { T: { of: { $req: true, $list: 'ref', min: 3, max: 3 }, signs: { $list: 'int:-1:1', min: 3, max: 3 }, pick: 'pick' }, R: { of: ['C', 'C', 'C'] }, out: 'C' },
    mec: { list: ['P'], min: 1, max: MAX_SET, out: 'C' },
    conic: { T: { points: { $list: 'ref', min: 5, max: 5 }, foci: { $list: 'ref', min: 2, max: 2 }, through: 'ref', type: 'enum:ellipse|hyperbola', focus: 'ref', directrix: 'ref', e: 'numx' },
      R: { points: ['P', 'P', 'P', 'P', 'P'], foci: ['P', 'P'], through: 'P', focus: 'P', directrix: LIN }, out: 'K' },
    polygon: { list: ['P'], min: 3, max: MAX_SET, out: 'G' },
    regular: { T: { center: 'ref!', vertex: 'ref!', n: 'int:3:60!' }, R: { center: 'P', vertex: 'P' }, out: 'G' },
    hull: { list: ['P'], min: 1, max: MAX_SET, out: 'G' },
    morley: { list: ['P', 'P', 'P'], min: 3, max: 3, out: 'G' },
    napoleon: { list: ['P', 'P', 'P'], min: 3, max: 3, out: 'G' },
    clip: { list: ['G', 'G'], min: 2, max: 2, out: 'G' },
    transform: { T: { kind: 'enum:' + TRANSFORMS.join('|') + '!', of: 'ref!', by: { $list: 'ref', min: 2, max: 2 }, dx: 'numx', dy: 'numx', center: 'ref', angle: 'numx', deg: 'bool',
      line: 'ref', factor: 'numx', circle: 'ref', k: 'numx', m: { $list: 'numx', min: 6, max: 6 }, from: { $list: 'ref', min: 4, max: 4 }, to: { $list: 'ref', min: 4, max: 4 } },
      R: { of: 'PLSRCKGUT', by: ['P', 'P'], center: 'P', line: LIN, circle: 'C', from: ['P', 'P', 'P', 'P'], to: ['P', 'P', 'P', 'P'] }, out: null },
    locus: { T: { of: 'ref!' }, R: { of: 'P' }, out: 'U' },
    bezier: { list: ['P'], min: 2, max: 20, out: 'U' },
    geodesic: { list: ['P', 'P'], min: 2, max: 2, out: 'U' },
    delaunay: { list: ['P'], min: 3, max: MAX_SET, out: 'T' },
    voronoi: { list: ['P'], min: 2, max: MAX_SET, out: 'T' },
  };
  const KIND_NAMES = Object.keys(KINDS);
  const TRANSFORM_NEEDS = { translate: [['by'], ['dx', 'dy']], rotate: [['center', 'angle']], reflect: [['line'], ['center']], dilate: [['center', 'factor']], invert: [['circle']], shear: [['k']], affine: [['m']], projective: [['from', 'to']] };
  /** the result type of a transform: similarities keep circles; affine and projective maps make conics; inversion makes circles (lines through its centre stay lines) and curves */
  function transformOut(kind, t) {
    if (kind === 'invert') return t === 'P' ? 'P' : t === 'L' || t === 'C' ? 'C' : 'PLSRCKGUT'.includes(t) && t !== 'T' ? 'U' : null;
    if (['shear', 'affine', 'projective'].includes(kind) && t === 'C') return 'K';
    return t;
  }
  const SWEEP_T = { var: 'name!', from: 'numx!', to: 'numx!', samples: 'int:2:2000' };
  const MODEL_T = { sweep: { $obj: SWEEP_T }, view: { $list: 'fin', min: 4, max: 4 }, tol: 'pos', seed: 'int:0:4294967295' };
  // the measures and asserts: signatures as alternatives [types per position, the last repeating when more]
  const SIGS = {
    x: [['P']], y: [['P']],
    dist: [['P', 'P'], ['P', LIN], ['P', 'C']],
    length: [['S'], ['P', 'P']],
    angle: [['P', 'P', 'P'], [LIN, LIN]],
    area: [['G'], ['C'], ['K'], ['P', 'P', 'P', '+']],
    perimeter: [['G'], ['C'], ['P', 'P', 'P', '+']],
    radius: [['C']], slope: [[LIN]], eccentricity: [['K'], ['C']], conicType: [['K'], ['C']],
    count: [[LIN + 'CK', LIN + 'CK']], power: [['P', 'C']], orient: [['P', 'P', 'P']], inside: [['P', 'GC']],
    crossRatio: [['P', 'P', 'P', 'P']],
    collinear: [['P', 'P', 'P', '+']], concyclic: [['P', 'P', 'P', 'P']], concurrent: [[LIN, LIN, LIN]], parallel: [[LIN, LIN]], perpendicular: [[LIN, LIN]],
    equal: [['P', 'P', 'P', 'P']], on: [['P', LIN + 'CKGU']], tangent: [[LIN + 'C', 'C'], ['C', LIN + 'C']], defined: [['PLSRCKGUT']],
  };
  const ASSERTS = ['collinear', 'concyclic', 'concurrent', 'parallel', 'perpendicular', 'equal', 'on', 'tangent'];
  const MEASURES = Object.keys(SIGS);
  const SCALAR_OF = MEASURES.concat(['flag', 'always', 'residual']);
  const SERIES_OF = ['sweep'].concat(MEASURES, ['residual']);
  const CODES = ['coincident-points', 'collinear', 'degenerate-triangle', 'parallel', 'coincident', 'tangent', 'no-intersection', 'concentric', 'contained',
    'separate', 'point-at-infinity', 'ill-conditioned', 'undefined', 'branch-switch', 'fermat-vertex', 'obtuse', 'right-angle', 'equilateral', 'isosceles',
    'euler-line-undefined', 'inversion-centre', 'conic-degenerate', 'conic-not-unique', 'huge-coordinates', 'locus-gaps',
    'self-intersecting', 'not-convex', 'inside-circle', 'no-solution', 'not-collinear', 'outside-disk', 'param'];
  const OUT_FIELDS = ['id', 'kind', 'of', 'at', 'unit', 'oriented', 'signed', 'code', 'test', 'samples', 'labels'];

  const sigText = alts => alts.map(a => a.map(t => (t === '+' ? '…' : t.split('').map(c => TYPE_NAMES[c]).join(' or '))).join(', ')).join('; or ');
  /** match refs' types against signatures → true | false (unknown types — objects with errors — always match) */
  function sigOk(alts, types) {
    return alts.some(a => {
      const more = a[a.length - 1] === '+', slots = more ? a.slice(0, -1) : a;
      if (types.length < slots.length || (!more && types.length > slots.length)) return false;
      return types.every((t, i) => t === null || (slots[Math.min(i, slots.length - 1)]).includes(t));
    });
  }

  /** checkSpec(spec) → [{code, path, msg, level}] (the same as tools/lib_geom.py check_spec) */
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = isObj(spec) ? spec.model : undefined;
    const types = new Map(), order = new Map();
    let sweep = false;
    if (!isObj(m)) E('format', 'model', 'not an object');
    else {
      const rest = {}; for (const k of Object.keys(m)) if (k !== 'objects') rest[k] = m[k];
      C.walk(rest, MODEL_T, 'model', E, W);
      sweep = isObj(m.sweep);
      const os = m.objects;
      if (!Array.isArray(os)) E(os === undefined ? 'value' : 'format', 'model.objects', os === undefined ? 'missing' : 'not an array');
      else if (os.length > MAX_OBJ) E('size', 'model.objects', `more than ${MAX_OBJ} items`);
      else if (!os.length) E('size', 'model.objects', 'fewer than 1 items');
      else {
        os.forEach((o, i) => { if (isObj(o) && C.checkKind('id', o.id) && !order.has(o.id)) order.set(o.id, i); });
        const seen = new Set();
        os.forEach((o, i) => {
          const p = `model.objects[${i}]`;
          if (!isObj(o)) { E('format', p, 'not an object'); return; }
          if (o.id === undefined) E('value', p + '.id', 'missing');
          else if (!C.checkKind('id', o.id)) E('value', p + '.id', C.kindMsg('id'));
          else if (seen.has(o.id)) E('duplicate', p + '.id', `the object ${o.id} is listed twice`);
          if (C.checkKind('id', o.id)) seen.add(o.id);
          const ks = Object.keys(o).filter(k => KINDS[k]);
          for (const k of Object.keys(o)) if (!KINDS[k] && !['id', 'hide', 'label', 'c', 'meta'].includes(k)) W('unknown-field', p + '.' + k, 'ignored');
          if (o.hide !== undefined && typeof o.hide !== 'boolean') E('value', p + '.hide', C.kindMsg('bool'));
          if (o.label !== undefined && !C.checkKind('key', o.label)) E('value', p + '.label', C.kindMsg('key'));
          if (o.c !== undefined && !ROLES.includes(o.c)) E('enum', p + '.c', 'one of ' + ROLES.join(', '));
          if (!ks.length) { E('kind', p, 'needs one construction: ' + KIND_NAMES.join(', ')); return; }
          if (ks.length > 1) { E('kind', p, 'more than one construction: ' + ks.join(', ')); return; }
          const kind = ks[0], K = KINDS[kind], v = o[kind], q = p + '.' + kind, n0 = P.filter(x => x.level === 'error').length;
          const refT = (r, rp, want) => {   // a reference: defined before, of a wanted type → its type (null when unknown)
            if (!C.checkKind('ref', r)) { E('value', rp, C.kindMsg('ref')); return null; }
            if (!types.has(r)) { if (order.has(r) && order.get(r) >= i) E('cycle', rp, `refers to ${r}, defined after it (objects are built in order)`); else E('ref', rp, 'not an object of the construction'); return null; }
            const t = types.get(r);
            if (t !== null && want && !want.includes(t)) { E('type', rp, `needs ${want.split('').map(c => TYPE_NAMES[c]).join(' or ')}`); return null; }
            return t;
          };
          const got = {};
          if (K.point) {
            if (Array.isArray(v)) { if (v.length !== 2 || !v.every(isNum)) E('value', q, 'needs [x, y] (two numbers) or {x, y}'); }
            else if (isObj(v)) C.walk(v, { x: 'numx!', y: 'numx!' }, q, E, W);
            else E('value', q, 'needs [x, y] (two numbers) or {x, y}');
          } else if (K.list) {
            if (!Array.isArray(v)) E('format', q, 'not an array');
            else if (v.length > K.max) E('size', q, `more than ${K.max} items`);
            else if (v.length < K.min) E('size', q, `fewer than ${K.min} items`);
            else got.list = v.map((r, j) => refT(r, `${q}[${j}]`, K.list[Math.min(j, K.list.length - 1)]));
          } else {
            if (!isObj(v)) E('format', q, 'not an object');
            else {
              const T2 = {}; for (const [f, kd] of Object.entries(K.T)) T2[f] = kd === 'pick' ? 'expr' : kd;
              C.walk(v, T2, q, E, W);
              if (v.pick !== undefined && typeof v.pick === 'string' && v.pick.trim() !== '' && !PICK_RE.test(v.pick)) E('value', q + '.pick', 'index:0–3, near:<id>, far:<id>, other:<id> or continuous');
              if (P.filter(x => x.level === 'error').length === n0) {
                for (const [f, want] of Object.entries(K.R || {})) {
                  if (v[f] === undefined) continue;
                  if (Array.isArray(want)) got[f] = v[f].map((r, j) => refT(r, `${q}.${f}[${j}]`, want[j]));
                  else got[f] = refT(v[f], `${q}.${f}`, want);
                }
                if (typeof v.pick === 'string' && /^(near|far|other):/.test(v.pick)) { const r = v.pick.split(':')[1]; refT(r, q + '.pick', 'P'); }
              }
            }
          }
          let out = K.out;
          if (P.filter(x => x.level === 'error').length === n0 && isObj(v)) {   // the variants and requirements of each construction
            if (kind === 'circle') {
              const a = v.center !== undefined && v.through !== undefined && v.r === undefined && v.points === undefined;
              const b = v.center !== undefined && v.r !== undefined && v.through === undefined && v.points === undefined;
              const c = v.points !== undefined && v.center === undefined && v.through === undefined && v.r === undefined;
              if (!(a || b || c)) E('value', q, 'needs {center, through}, {center, r} or {points: [A, B, C]}');
              if (isNum(v.r) && v.r < 0) E('value', q + '.r', 'needs a number >= 0');
            }
            if (kind === 'conic') {
              const a = v.points !== undefined && v.foci === undefined && v.focus === undefined;
              const b = v.foci !== undefined && v.through !== undefined && v.points === undefined && v.focus === undefined;
              const c = v.focus !== undefined && v.directrix !== undefined && v.e !== undefined && v.points === undefined && v.foci === undefined;
              if (!(a || b || c)) E('value', q, 'needs {points: [5 points]}, {foci: [F1, F2], through, type?} or {focus, directrix, e}');
              if (isNum(v.e) && !(v.e > 0)) E('value', q + '.e', 'needs a number > 0');
            }
            if (kind === 'transform') {
              const alts = TRANSFORM_NEEDS[v.kind];
              if (!alts.some(fs => fs.every(f => v[f] !== undefined))) E('value', q, `${v.kind} needs ${alts.map(fs => fs.join(' and ')).join(' or ')}`);
              else { out = got.of === null || got.of === undefined ? null : transformOut(v.kind, got.of); if (out === null && got.of) E('type', q + '.of', `${v.kind} cannot map ${TYPE_NAMES[got.of]}`); }
            }
            if (kind === 'locus' && !sweep) E('value', q, 'needs model.sweep (the driver of the locus)');
          }
          if (P.filter(x => x.level === 'error').length > n0) out = null;
          if (C.checkKind('id', o.id) && !types.has(o.id)) types.set(o.id, out);
        });
        if (sweep && isNum(m.sweep.samples || 200) && (m.sweep.samples || 200) * os.length > BUDGET) E('budget', 'model.sweep.samples', `samples × objects is more than ${BUDGET}`);
      }
    }
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], (o, at) => {
      for (const k of Object.keys(o)) if (!OUT_FIELDS.includes(k)) W('unknown-field', at + '.' + k, 'ignored');
      const list = o.kind === 'scalar' ? SCALAR_OF : o.kind === 'series' ? SERIES_OF : ['drawing'];
      if (!list.includes(o.of)) { E('output', at + '.of', `${o.kind} outputs of ${ID}: ${list.join(', ')}`); return; }
      if (o.kind === 'scene') { if (o.labels !== undefined && !['id', 'none'].includes(o.labels)) E('enum', at + '.labels', 'one of id, none'); return; }
      if (o.kind === 'series' && !sweep) { E('value', at + '.of', 'a series needs model.sweep'); return; }
      if (o.unit !== undefined && !['deg', 'rad'].includes(o.unit)) E('enum', at + '.unit', 'one of deg, rad');
      for (const f of ['oriented', 'signed']) if (o[f] !== undefined && typeof o[f] !== 'boolean') E('value', at + '.' + f, C.kindMsg('bool'));
      if (o.samples !== undefined && !C.checkKind('int:1:200', o.samples)) E('value', at + '.samples', C.kindMsg('int:1:200'));
      if (o.of === 'flag') { if (!CODES.includes(o.code)) E('enum', at + '.code', 'one of ' + CODES.join(', ')); }
      else if (o.code !== undefined) W('unknown-field', at + '.code', 'ignored');
      let sig = null, what = o.of;
      if (o.of === 'always' || o.of === 'residual') { if (!ASSERTS.includes(o.test)) { E('enum', at + '.test', 'one of ' + ASSERTS.join(', ')); return; } sig = SIGS[o.test]; what = o.test; }
      else if (o.test !== undefined) W('unknown-field', at + '.test', 'ignored');
      if (o.of === 'sweep' || (o.of === 'flag' && o.at === undefined)) return;
      if (o.of === 'flag') sig = [['PLSRCKGUT']];
      else if (!sig) sig = SIGS[o.of];
      if (!Array.isArray(o.at)) { E('value', at + '.at', o.at === undefined ? 'missing (the objects it is about)' : 'not an array'); return; }
      const ts = []; let bad = false;
      o.at.forEach((r, j) => {
        if (!C.checkKind('ref', r)) { E('value', `${at}.at[${j}]`, C.kindMsg('ref')); bad = true; }
        else if (!types.has(r)) { E('ref', `${at}.at[${j}]`, 'not an object of the construction'); bad = true; }
        else ts.push(types.get(r));
      });
      if (!bad && !sigOk(sig, ts)) E('type', at + '.at', `${what} needs ${sigText(sig)}`);
      if (o.of === 'always' && (o.samples || 20) * (isObj(m) && Array.isArray(m.objects) ? m.objects.length : 0) > BUDGET) E('budget', at + '.samples', `samples × objects is more than ${BUDGET}`);
    }, E, W);
    return P;
  }
  /** exprs(spec) → [[source, path, local names]]: every expression of the model (objects may use the sweep's variable) */
  function exprs(spec) {
    const out = [], m = spec && spec.model;
    if (!isObj(m)) return out;
    const loc = isObj(m.sweep) && typeof m.sweep.var === 'string' ? [m.sweep.var] : [];
    const sx = (v, p, l) => { if (typeof v === 'string') out.push([v, p, l]); };
    (Array.isArray(m.objects) ? m.objects : []).forEach((o, i) => {
      if (!isObj(o)) return;
      const p = `model.objects[${i}]`;
      if (isObj(o.point)) { sx(o.point.x, p + '.point.x', loc); sx(o.point.y, p + '.point.y', loc); }
      if (isObj(o.pointOn)) sx(o.pointOn.t, p + '.pointOn.t', loc);
      if (isObj(o.circle)) sx(o.circle.r, p + '.circle.r', loc);
      if (isObj(o.conic)) sx(o.conic.e, p + '.conic.e', loc);
      if (isObj(o.transform)) {
        for (const f of ['dx', 'dy', 'angle', 'factor', 'k']) sx(o.transform[f], `${p}.transform.${f}`, loc);
        if (Array.isArray(o.transform.m)) o.transform.m.forEach((x, j) => sx(x, `${p}.transform.m[${j}]`, loc));
      }
    });
    if (isObj(m.sweep)) { sx(m.sweep.from, 'model.sweep.from', []); sx(m.sweep.to, 'model.sweep.to', []); }
    return out;
  }
  /** keys(spec) → [[key, path]] */
  function keys(spec) {
    const out = [], m = spec && spec.model;
    if (isObj(m) && Array.isArray(m.objects)) m.objects.forEach((o, i) => { if (isObj(o) && typeof o.label === 'string') out.push([o.label, `model.objects[${i}].label`]); });
    return out;
  }

  /* ================= the geometry: values ================= */
  // P {t:'P', x, y} (inf: a point at infinity, x/y its direction) · L {t:'L', a, b, c (a²+b² = 1), p:[x,y], q:[x,y], sub: line|segment|ray}
  // C {t:'C', x, y, r} · K {t:'K', m: [a, b, c, d, e, f] of ax² + bxy + cy² + dx + ey + f = 0} · G {t:'G', pts} · U {t:'U', lines} · T {t:'T', segs}
  // X {t:'X', code, cause}: undefined (with the root cause's object id)
  const pt = (x, y) => ({ t: 'P', x, y });
  const und = (code, cause) => ({ t: 'X', code, cause });
  function lineThrough(px, py, qx, qy, sub) {
    const dx = qx - px, dy = qy - py, L = hypot(dx, dy);
    if (!(L > 0) || !Number.isFinite(L)) return null;
    const a = -dy / L, b = dx / L;
    return { t: 'L', a, b, c: -(a * px + b * py), p: [px, py], q: [qx, qy], sub: sub || 'line' };
  }
  const lineDir = (px, py, dx, dy) => lineThrough(px, py, px + dx, py + dy, 'line');
  const dirOf = l => [l.b, -l.a];   // the unit direction from p to q
  const sdist = (l, x, y) => l.a * x + l.b * y + l.c;
  const paramOn = (l, x, y) => { const [dx, dy] = dirOf(l); return (x - l.p[0]) * dx + (y - l.p[1]) * dy; };
  function withinSub(l, x, y, tol) {   // a point on the line: inside the segment / ray?
    if (l.sub === 'line') return true;
    const s = paramOn(l, x, y), len = hypot(l.q[0] - l.p[0], l.q[1] - l.p[1]);
    return s >= -tol && (l.sub === 'ray' || s <= len + tol);
  }
  const circleConic = c => ({ t: 'K', m: [1, 0, 1, -2 * c.x, -2 * c.y, c.x * c.x + c.y * c.y - c.r * c.r] });
  const conicMat = m => [[m[0], m[1] / 2, m[3] / 2], [m[1] / 2, m[2], m[4] / 2], [m[3] / 2, m[4] / 2, m[5]]];
  const matConic = M => [M[0][0], 2 * M[0][1], M[1][1], 2 * M[0][2], 2 * M[1][2], M[2][2]];
  const det3 = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const mul3 = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const tr3 = A => [0, 1, 2].map(i => [A[0][i], A[1][i], A[2][i]]);
  function inv3(A) {
    const d = det3(A); if (!d || !Number.isFinite(d)) return null;
    const c = (i, j) => { const r = [0, 1, 2].filter(x => x !== i), s = [0, 1, 2].filter(x => x !== j); return ((i + j) % 2 ? -1 : 1) * (A[r[0]][s[0]] * A[r[1]][s[1]] - A[r[0]][s[1]] * A[r[1]][s[0]]); };
    return [0, 1, 2].map(i => [0, 1, 2].map(j => c(j, i) / d));
  }
  const applyH = (H, x, y) => { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]; };
  /** solve n×n (Gaussian elimination, partial pivoting) → x or null */
  function solve(A, b) {
    const n = A.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let k = 0; k < n; k++) {
      let p = k; for (let i = k + 1; i < n; i++) if (abs(M[i][k]) > abs(M[p][k])) p = i;
      if (abs(M[p][k]) < 1e-300) return null; [M[k], M[p]] = [M[p], M[k]];
      for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x.every(Number.isFinite) ? x : null;
  }
  /** the real roots of a·x² + b·x + c, stable (Numerical Recipes §5.6), ascending; tolD: a discriminant within it counts as a double root */
  function quadRoots(a, b, c, tolD) {
    if (abs(a) < 1e-300) return abs(b) < 1e-300 ? [] : [-c / b];
    let D = b * b - 4 * a * c;
    if (D < 0 && D > -(tolD || 0)) D = 0;
    if (D < 0) return [];
    if (D === 0) return [-b / (2 * a)];
    const q = -0.5 * (b + (b >= 0 ? 1 : -1) * sqrt(D)), r = [q / a, c / q].sort((x, y) => x - y);
    return r;
  }
  /** the real roots of x³ + a·x² + b·x + c (trigonometric for three, Cardano for one; Blinn 2006–07), polished by Newton */
  function cubicRoots(A, B, Cc, D) {
    if (abs(A) < 1e-300) return quadRoots(B, Cc, D, 0);
    const a = B / A, b = Cc / A, c = D / A, p = b - a * a / 3, q = 2 * a * a * a / 27 - a * b / 3 + c, disc = q * q / 4 + p * p * p / 27;
    let r;
    if (abs(p) < 1e-300 && abs(q) < 1e-300) r = [0];
    else if (disc > 0) { const s = sqrt(disc), u = cbrt(-q / 2 + s), v = cbrt(-q / 2 - s); r = [u + v]; }
    else { const m = 2 * sqrt(-p / 3), th = atan2(sqrt(Math.max(0, -disc)), -q / 2) / 3; r = [0, 1, 2].map(k => m * cos(th - 2 * PI * k / 3)); }
    r = r.map(x => x - a / 3).map(x => { for (let i = 0; i < 4; i++) { const f = ((x + a) * x + b) * x + c, d = (3 * x + 2 * a) * x + b; if (d === 0) break; const nx = x - f / d; if (!Number.isFinite(nx)) break; x = nx; } return x; });
    return r.sort((x, y) => x - y);
  }

  /* ---------- intersections, classified (research §4.3) ---------- */
  function interLL(l1, l2, tol, S, D, id) {
    const d = l1.a * l2.b - l2.a * l1.b;
    if (abs(d) < 1e-12) {
      const sg = l1.a * l2.a + l1.b * l2.b >= 0 ? 1 : -1;
      if (abs(l1.c - sg * l2.c) < tol) { D.add('coincident', id); return { coincident: true, pts: [] }; }
      D.add('parallel', id); return { pts: [], inf: [l1.b, -l1.a] };
    }
    const x = (l1.b * l2.c - l2.b * l1.c) / d, y = (l2.a * l1.c - l1.a * l2.c) / d;
    if (abs(d) < 1e-8 && hypot(x, y) > 1e6 * S) D.add('ill-conditioned', id);
    return { pts: [[x, y]] };
  }
  function interLC(l, c, tol, D, id) {
    const h = sdist(l, c.x, c.y), fx = c.x - l.a * h, fy = c.y - l.b * h, ah = abs(h), [dx, dy] = dirOf(l);
    if (ah > c.r + tol) { D.add('no-intersection', id); return { pts: [] }; }
    if (abs(ah - c.r) <= tol) { D.add('tangent', id); return { pts: [[fx, fy]] }; }
    const s = sqrt((c.r - ah) * (c.r + ah));
    return { pts: [[fx - s * dx, fy - s * dy], [fx + s * dx, fy + s * dy]] };   // ordered along the line's direction p → q
  }
  function interCC(c1, c2, tol, D, id) {
    const dx = c2.x - c1.x, dy = c2.y - c1.y, d = hypot(dx, dy);
    if (d < tol) { if (abs(c1.r - c2.r) < tol) { D.add('coincident', id); return { coincident: true, pts: [] }; } D.add('concentric', id); return { pts: [] }; }
    if (d > c1.r + c2.r + tol) { D.add('separate', id); D.add('no-intersection', id); return { pts: [] }; }
    if (d < abs(c1.r - c2.r) - tol) { D.add('contained', id); D.add('no-intersection', id); return { pts: [] }; }
    const a = (d * d + c1.r * c1.r - c2.r * c2.r) / (2 * d), ux = dx / d, uy = dy / d, mx = c1.x + a * ux, my = c1.y + a * uy;
    if (abs(d - (c1.r + c2.r)) <= tol || abs(d - abs(c1.r - c2.r)) <= tol) { D.add('tangent', id); return { pts: [[mx, my]] }; }
    const h = sqrt(Math.max(0, (c1.r - a) * (c1.r + a)));
    return { pts: [[mx - h * uy, my + h * ux], [mx + h * uy, my - h * ux]] };   // index 0: left of the directed line c1 → c2
  }
  function interLK(l, k, tol, D, id) {   // the line p + s·u in the conic: a quadratic in s
    const [a, b, c, d, e, f] = k.m, [px, py] = l.p, [ux, uy] = dirOf(l);
    const A = a * ux * ux + b * ux * uy + c * uy * uy, B = 2 * a * px * ux + b * (px * uy + py * ux) + 2 * c * py * uy + d * ux + e * uy, Cc = a * px * px + b * px * py + c * py * py + d * px + e * py + f;
    const sc = Math.max(abs(a), abs(b), abs(c), abs(d), abs(e), abs(f), 1e-300);
    const rs = quadRoots(A / sc, B / sc, Cc / sc, 1e-12);
    if (!rs.length) D.add('no-intersection', id); else if (rs.length === 1 && abs(A / sc) > 1e-14) D.add('tangent', id);
    return { pts: rs.map(s => [px + s * ux, py + s * uy]) };
  }
  /** split a degenerate conic (det = 0) into two real lines (Richter-Gebert 2011 §11.3) → [[a,b,c],[a,b,c]] or null */
  function splitDegenerate(M) {
    const adj = [0, 1, 2].map(i => [0, 1, 2].map(j => { const r = [0, 1, 2].filter(x => x !== j), s = [0, 1, 2].filter(x => x !== i); return ((i + j) % 2 ? -1 : 1) * (M[r[0]][s[0]] * M[r[1]][s[1]] - M[r[0]][s[1]] * M[r[1]][s[0]]); }));
    let i = 0; for (let k = 1; k < 3; k++) if (abs(adj[k][k]) > abs(adj[i][i])) i = k;
    const sc = Math.max(...M.flat().map(abs), 1e-300);
    let Mp;
    if (abs(adj[i][i]) > 1e-12 * sc * sc) {
      if (-adj[i][i] < 0) return null;   // a pair of complex lines
      const beta = sqrt(-adj[i][i]), p = [0, 1, 2].map(r => adj[r][i] / beta);
      const X = [[0, p[2], -p[1]], [-p[2], 0, p[0]], [p[1], -p[0], 0]];
      Mp = M.map((r, a) => r.map((v, b) => v + X[a][b]));
    } else Mp = M;   // a double line: rank 1
    let bi = 0, bj = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (abs(Mp[a][b]) > abs(Mp[bi][bj])) { bi = a; bj = b; }
    if (abs(Mp[bi][bj]) < 1e-14 * sc) return null;
    return [Mp[bi].slice(), [Mp[0][bj], Mp[1][bj], Mp[2][bj]]];
  }
  function homLine(h) { const n = hypot(h[0], h[1]); if (!(n > 0)) return null; const a = h[0] / n, b = h[1] / n, c = h[2] / n, px = -a * c, py = -b * c; return { t: 'L', a, b, c, p: [px, py], q: [px + b, py - a], sub: 'line' }; }
  function interKK(k1, k2, tol, D, id) {   // the degenerate conics of the pencil A + λB: det = 0 is a cubic in λ (Richter-Gebert 2011 §11.4)
    const A = conicMat(k1.m), B = conicMat(k2.m), f = l => det3(A.map((r, i) => r.map((v, j) => v + l * B[i][j])));
    const f0 = f(0), f1 = f(1), fm = f(-1), f2 = f(2), c3 = (f2 - 2 * f1 + 2 * fm - f(-2)) / 12 + 0, dB = det3(B);
    // the cubic det(A + λB) = dB·λ³ + p λ² + q λ + f0 from three samples
    const p = (f1 + fm) / 2 - f0, q = (f1 - fm) / 2 - dB;
    void c3;
    const roots = cubicRoots(dB, p, q, f0), pts = [];
    if (abs(dB) < 1e-300 && !roots.length) roots.push(0);
    for (const lam of roots.concat([Infinity])) {
      const M = lam === Infinity ? B : A.map((r, i) => r.map((v, j) => v + lam * B[i][j]));
      const ls = splitDegenerate(M); if (!ls) continue;
      for (const h of ls) {
        const L = homLine(h); if (!L) continue;
        for (const [x, y] of interLK(L, k1, tol, { add() { } }, id).pts) {
          const r2 = k2.m, v = r2[0] * x * x + r2[1] * x * y + r2[2] * y * y + r2[3] * x + r2[4] * y + r2[5], g = hypot(2 * r2[0] * x + r2[1] * y + r2[3], r2[1] * x + 2 * r2[2] * y + r2[4]);
          if (abs(v) <= Math.max(1e-7, 1e-7 * g) * Math.max(1, tol * 1e9) && !pts.some(o => hypot(o[0] - x, o[1] - y) < 1e3 * tol)) pts.push([x, y]);
        }
      }
    }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (!pts.length) D.add('no-intersection', id);
    return { pts };
  }
  function intersectAll(o1, o2, tol, S, D, id) {
    const T = v => v.t;
    let r;
    if (T(o1) === 'L' && T(o2) === 'L') r = interLL(o1, o2, tol, S, D, id);
    else if (T(o1) === 'L' && T(o2) === 'C') r = interLC(o1, o2, tol, D, id);
    else if (T(o1) === 'C' && T(o2) === 'L') r = interLC(o2, o1, tol, D, id);
    else if (T(o1) === 'C' && T(o2) === 'C') r = interCC(o1, o2, tol, D, id);
    else if (T(o1) === 'L') r = interLK(o1, T(o2) === 'C' ? circleConic(o2) : o2, tol, D, id);
    else if (T(o2) === 'L') r = interLK(o2, T(o1) === 'C' ? circleConic(o1) : o1, tol, D, id);
    else r = interKK(T(o1) === 'C' ? circleConic(o1) : o1, T(o2) === 'C' ? circleConic(o2) : o2, tol, D, id);
    const lines = [o1, o2].filter(o => o.t === 'L' && o.sub !== 'line');
    if (lines.length) { const before = r.pts.length; r.pts = r.pts.filter(([x, y]) => lines.every(l => withinSub(l, x, y, tol))); if (before && !r.pts.length) D.add('no-intersection', id); }
    return r;
  }

  /* ---------- triangle centres: barycentrics with the side lengths (Kimberling, Encyclopedia of Triangle Centers; Yiu 2013) ---------- */
  function triInfo(A, B, Cp, S, D, id) {
    const a = hypot(B.x - Cp.x, B.y - Cp.y), b = hypot(Cp.x - A.x, Cp.y - A.y), c = hypot(A.x - B.x, A.y - B.y);
    const area2 = (B.x - A.x) * (Cp.y - A.y) - (B.y - A.y) * (Cp.x - A.x);
    const ang = (P, Q, R) => abs(atan2((Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x), (Q.x - P.x) * (R.x - P.x) + (Q.y - P.y) * (R.y - P.y)));
    const angles = [ang(A, B, Cp), ang(B, Cp, A), ang(Cp, A, B)];
    const degen = abs(area2) / 2 < 1e-12 * S * S;
    return { a, b, c, area: area2 / 2, angles, degen };
  }
  function bary(A, B, Cp, al, be, ga, D, id) {
    const s = al + be + ga;
    if (!Number.isFinite(s)) return und('undefined', id);
    if (abs(s) < 1e-14 * (abs(al) + abs(be) + abs(ga) || 1)) { D.add('point-at-infinity', id); return und('point-at-infinity', id); }
    return pt((al * A.x + be * B.x + ga * Cp.x) / s, (al * A.y + be * B.y + ga * Cp.y) / s);
  }
  function circumcenter(A, B, Cp) {   // the determinant formula with A at the origin (numerically better; research §4.3)
    const bx = B.x - A.x, by = B.y - A.y, cx = Cp.x - A.x, cy = Cp.y - A.y, d = 2 * (bx * cy - by * cx);
    if (d === 0) return null;
    const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    return pt(A.x + (cy * b2 - by * c2) / d, A.y + (bx * c2 - cx * b2) / d);
  }
  function centre(kind, A, B, Cp, S, D, id) {
    const I = triInfo(A, B, Cp, S, D, id), { a, b, c } = I, [Aa, Ba, Ca] = I.angles, s = (a + b + c) / 2;
    if (kind === 'centroid') return pt((A.x + B.x + Cp.x) / 3, (A.y + B.y + Cp.y) / 3);
    if (I.degen) { D.add('degenerate-triangle', id); D.add('collinear', id); return und('degenerate-triangle', id); }
    const tolA = 1e-9;
    if (Math.max(Aa, Ba, Ca) > PI / 2 + tolA) D.add('obtuse', id);
    if ([Aa, Ba, Ca].some(x => abs(x - PI / 2) <= tolA)) D.add('right-angle', id);
    const eqTol = 1e-9 * S, eq = abs(a - b) <= eqTol && abs(b - c) <= eqTol;
    if (eq) D.add('equilateral', id); else if (abs(a - b) <= eqTol || abs(b - c) <= eqTol || abs(a - c) <= eqTol) D.add('isosceles', id);
    const O = circumcenter(A, B, Cp);
    switch (kind) {
      case 'incenter': return bary(A, B, Cp, a, b, c, D, id);                             // X(1)
      case 'circumcenter': return O;                                                     // X(3)
      case 'orthocenter': return pt(A.x + B.x + Cp.x - 2 * O.x, A.y + B.y + Cp.y - 2 * O.y);   // X(4): H = A + B + C − 2O
      case 'ninepoint': return pt((A.x + B.x + Cp.x - O.x) / 2, (A.y + B.y + Cp.y - O.y) / 2);  // X(5): N = (O + H)/2
      case 'symmedian': return bary(A, B, Cp, a * a, b * b, c * c, D, id);              // X(6)
      case 'gergonne': return bary(A, B, Cp, 1 / (s - a), 1 / (s - b), 1 / (s - c), D, id);   // X(7)
      case 'nagel': return bary(A, B, Cp, s - a, s - b, s - c, D, id);                   // X(8)
      case 'mittenpunkt': return bary(A, B, Cp, a * (s - a), b * (s - b), c * (s - c), D, id);   // X(9)
      case 'spieker': return bary(A, B, Cp, b + c, c + a, a + b, D, id);                 // X(10)
      case 'feuerbach': if (eq) { D.add('undefined', id); return und('equilateral', id); } return bary(A, B, Cp, (s - a) * (b - c) * (b - c), (s - b) * (c - a) * (c - a), (s - c) * (a - b) * (a - b), D, id);   // X(11)
      case 'fermat': {                                                                    // X(13): trilinears csc(A + π/3), all angles < 120°
        const big = [Aa, Ba, Ca].findIndex(x => x >= 2 * PI / 3 - tolA);
        if (big >= 0) { D.add('fermat-vertex', id); return [A, B, Cp][big]; }
        return bary(A, B, Cp, a / sin(Aa + PI / 3), b / sin(Ba + PI / 3), c / sin(Ca + PI / 3), D, id);
      }
      case 'delongchamps': return pt(2 * O.x - (A.x + B.x + Cp.x - 2 * O.x), 2 * O.y - (A.y + B.y + Cp.y - 2 * O.y));   // X(20) = 2O − H
      case 'excenter-a': return bary(A, B, Cp, -a, b, c, D, id);
      case 'excenter-b': return bary(A, B, Cp, a, -b, c, D, id);
      case 'excenter-c': return bary(A, B, Cp, a, b, -c, D, id);
    }
    return und('undefined', id);
  }
  function triCircle(kind, A, B, Cp, S, D, id) {
    const I = triInfo(A, B, Cp, S, D, id), { a, b, c } = I, s = (a + b + c) / 2, area = abs(I.area);
    if (I.degen) {
      D.add('collinear', id); D.add('degenerate-triangle', id);
      if (kind === 'circumcircle') { const pts = [A, B, Cp].sort((p, q) => p.x - q.x || p.y - q.y), l = lineThrough(pts[0].x, pts[0].y, pts[2].x, pts[2].y); if (l) return l; }   // the generalised circle: a line
      return und('degenerate-triangle', id);
    }
    const O = circumcenter(A, B, Cp), R = a * b * c / (4 * area);
    if (kind === 'circumcircle') return { t: 'C', x: O.x, y: O.y, r: R };
    if (kind === 'ninepoint') return { t: 'C', x: (A.x + B.x + Cp.x - O.x) / 2, y: (A.y + B.y + Cp.y - O.y) / 2, r: R / 2 };
    if (kind === 'incircle') { const P = bary(A, B, Cp, a, b, c, D, id); return { t: 'C', x: P.x, y: P.y, r: area / s }; }
    const k = { 'excircle-a': [-a, b, c, s - a], 'excircle-b': [a, -b, c, s - b], 'excircle-c': [a, b, -c, s - c] }[kind];
    const P = bary(A, B, Cp, k[0], k[1], k[2], D, id); return { t: 'C', x: P.x, y: P.y, r: area / k[3] };
  }

  /* ---------- conics: matrices, analysis (centre, axes, foci, eccentricity) and drawing (Richter-Gebert 2011 ch. 9–11) ---------- */
  function conic5(ps, S, D, id) {   // the null vector of the 5×6 system in scaled coordinates, then back
    let mx = 0, my = 0; for (const p of ps) { mx += p.x / 5; my += p.y / 5; }
    let sc = 0; for (const p of ps) sc = Math.max(sc, abs(p.x - mx), abs(p.y - my)); if (!(sc > 0)) { D.add('conic-not-unique', id); return und('conic-not-unique', id); }
    const rows = ps.map(p => { const x = (p.x - mx) / sc, y = (p.y - my) / sc; return [x * x, x * y, y * y, x, y, 1]; });
    // Gaussian elimination with full column pivoting to find the free column
    const M = rows.map(r => r.slice()), piv = [];
    let r0 = 0; const used = new Array(6).fill(false);
    for (let k = 0; k < 5; k++) {
      let bi = -1, bj = -1, bv = 0;
      for (let i = r0; i < 5; i++) for (let j = 0; j < 6; j++) if (!used[j] && abs(M[i][j]) > bv) { bv = abs(M[i][j]); bi = i; bj = j; }
      if (bv < 1e-10) { D.add('conic-not-unique', id); return und('conic-not-unique', id); }
      [M[r0], M[bi]] = [M[bi], M[r0]]; used[bj] = true; piv.push([r0, bj]);
      for (let i = 0; i < 5; i++) if (i !== r0) { const f = M[i][bj] / M[r0][bj]; for (let j = 0; j < 6; j++) M[i][j] -= f * M[r0][j]; }
      r0++;
    }
    const free = used.indexOf(false), v = new Array(6).fill(0); v[free] = 1;
    for (const [r, j] of piv) v[j] = -M[r][free] / M[r][j];
    const Cp = conicMat(v), T = [[1 / sc, 0, -mx / sc], [0, 1 / sc, -my / sc], [0, 0, 1]];
    const K = { t: 'K', m: normConic(matConic(mul3(tr3(T), mul3(Cp, T)))) };
    return K;
  }
  function normConic(m) { const s = Math.max(...m.map(abs)); return s > 0 ? m.map(x => x / s) : m; }
  /** analyse a conic → {type: 0 degenerate · 1 ellipse · 2 parabola · 3 hyperbola, e, cx, cy, th, A, B (semi-axes), foci, vertex, p} */
  function analyse(k) {
    const [a, b, c, d, e, f] = k.m, M = conicMat(k.m), sc = Math.max(...k.m.map(abs), 1e-300), dt = det3(M) / (sc * sc * sc), disc = (b * b - 4 * a * c) / (sc * sc);
    const th = 0.5 * atan2(b, a - c), ct = cos(th), st = sin(th);
    const l1 = a * ct * ct + b * ct * st + c * st * st, l2 = a * st * st - b * ct * st + c * ct * ct;   // the quadratic part in the rotated frame
    if (abs(dt) < 1e-12) return { type: 0 };
    if (abs(disc) < 1e-12) {   // parabola: rotate so the axis is the rotated y' (l1 ≠ 0) or x'
      const swap = abs(l1) < abs(l2), A2 = swap ? l2 : l1, ang = swap ? th + PI / 2 : th, c2 = cos(ang), s2 = sin(ang);
      const D2 = d * c2 + e * s2, E2 = -d * s2 + e * c2;   // A2·u² + D2·u + E2·v + f = 0 with x = u c2 − v s2, y = u s2 + v c2
      if (abs(E2) < 1e-14 * sc) return { type: 0 };
      const aa = -A2 / E2, uv = -D2 / (2 * A2), vv = -(A2 * uv * uv + D2 * uv + f) / E2, fl = 1 / (4 * aa);
      const rot = (u, v) => [u * c2 - v * s2, u * s2 + v * c2];
      return { type: 2, e: 1, vertex: rot(uv, vv), foci: [rot(uv, vv + fl)], th: ang, aa, uv, vv, rot, p: abs(fl) };
    }
    const cx = (b * e - 2 * c * d) / (4 * a * c - b * b), cy = (b * d - 2 * a * e) / (4 * a * c - b * b), f2 = f + (d * cx + e * cy) / 2;
    if (disc < 0) {
      if (-f2 / l1 <= 0 || -f2 / l2 <= 0) return { type: 0, imaginary: true };
      let A = sqrt(-f2 / l1), B = sqrt(-f2 / l2), t2 = th; if (B > A) { [A, B] = [B, A]; t2 = th + PI / 2; }
      const cf = sqrt(Math.max(0, A * A - B * B)), ux = cos(t2), uy = sin(t2);
      return { type: 1, cx, cy, th: t2, A, B, e: cf / A, foci: [[cx + cf * ux, cy + cf * uy], [cx - cf * ux, cy - cf * uy]] };
    }
    // hyperbola: the transverse axis is where −f2/λ > 0
    let A, B, t2;
    if (-f2 / l1 > 0) { A = sqrt(-f2 / l1); B = sqrt(f2 / l2); t2 = th; } else { A = sqrt(-f2 / l2); B = sqrt(f2 / l1); t2 = th + PI / 2; }
    const cf = sqrt(A * A + B * B), ux = cos(t2), uy = sin(t2);
    return { type: 3, cx, cy, th: t2, A, B, e: cf / A, foci: [[cx + cf * ux, cy + cf * uy], [cx - cf * ux, cy - cf * uy]] };
  }
  function conicCanon(cx, cy, th, A, B, hyper) {   // x'²/A² ± y'²/B² = 1, rotated by th, centred at (cx, cy)
    const ct = cos(th), st = sin(th), sB = hyper ? -1 : 1;
    const Q = [[1 / (A * A), 0, 0], [0, sB / (B * B), 0], [0, 0, -1]], R = [[ct, st, -(ct * cx + st * cy)], [-st, ct, -(-st * cx + ct * cy)], [0, 0, 1]];
    return { t: 'K', m: normConic(matConic(mul3(tr3(R), mul3(Q, R)))) };
  }
  function conicPoints(k, info, view, n) {   // polylines for drawing (and points on it: pointOn)
    const W = Math.max(view[1] - view[0], view[3] - view[2]) * 2 + hypot((view[0] + view[1]) / 2, (view[2] + view[3]) / 2);
    const out = [];
    if (info.type === 1) { const L = []; for (let i = 0; i <= n; i++) { const t = 2 * PI * i / n, x = info.A * cos(t), y = info.B * sin(t); L.push(info.cx + x * cos(info.th) - y * sin(info.th), info.cy + x * sin(info.th) + y * cos(info.th)); } out.push(L); }
    else if (info.type === 3) { const T = acosh(Math.max(1.0001, W / info.A + 1)); for (const sg of [1, -1]) { const L = []; for (let i = 0; i <= n; i++) { const t = -T + 2 * T * i / n, x = sg * info.A * cosh(t), y = info.B * sinh(t); L.push(info.cx + x * cos(info.th) - y * sin(info.th), info.cy + x * sin(info.th) + y * cos(info.th)); } out.push(L); } }
    else if (info.type === 2) { const U = sqrt(W / Math.max(1e-12, abs(info.aa))) + W, L = []; for (let i = 0; i <= n; i++) { const u = info.uv - U + 2 * U * i / n, v = info.aa * (u - info.uv) * (u - info.uv) + info.vv, [x, y] = info.rot(u, v); L.push(x, y); } out.push(L); }
    else { const ls = splitDegenerate(conicMat(k.m)); if (ls) for (const h of ls) { const L = homLine(h); if (L) { const s = clipLine(L, view); if (s) out.push(s); } } }
    return out;
  }
  function clipLine(l, v) {   // Liang–Barsky on the view rectangle (a ray or a segment keeps its own ends)
    const [dx, dy] = dirOf(l); let t0 = -Infinity, t1 = Infinity;
    if (l.sub !== 'line') { t0 = 0; if (l.sub === 'segment') t1 = hypot(l.q[0] - l.p[0], l.q[1] - l.p[1]); }
    const P = [-dx, dx, -dy, dy], Q = [l.p[0] - v[0], v[1] - l.p[0], l.p[1] - v[2], v[3] - l.p[1]];
    for (let i = 0; i < 4; i++) { if (P[i] === 0) { if (Q[i] < 0) return null; continue; } const r = Q[i] / P[i]; if (P[i] < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); }
    if (!(t0 <= t1) || !Number.isFinite(t0) || !Number.isFinite(t1)) return null;
    return [l.p[0] + t0 * dx, l.p[1] + t0 * dy, l.p[0] + t1 * dx, l.p[1] + t1 * dy];
  }

  /* ---------- computational geometry ---------- */
  function hull(ps) {   // Andrew's monotone chain (1979) with the exact orientation; counter-clockwise, collinear points dropped
    const P = ps.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((p, i, A) => !i || p[0] !== A[i - 1][0] || p[1] !== A[i - 1][1]);
    if (P.length < 3) return P;
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && orient(...lo[lo.length - 2], ...lo[lo.length - 1], ...p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && orient(...up[up.length - 2], ...up[up.length - 1], ...p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function winding(px, py, pts) {   // the winding number with exact orientations (Hormann & Agathos 2001, CGTA 20:131; Sunday's crossing rule)
    let w = 0; const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const x1 = pts[2 * i], y1 = pts[2 * i + 1], x2 = pts[2 * ((i + 1) % n)], y2 = pts[2 * ((i + 1) % n) + 1];
      if (y1 <= py) { if (y2 > py && orient(x1, y1, x2, y2, px, py) > 0) w++; }
      else if (y2 <= py && orient(x1, y1, x2, y2, px, py) < 0) w--;
    }
    return w;
  }
  function onBoundary(px, py, pts, tol) { const n = pts.length / 2; for (let i = 0; i < n; i++) { const l = lineThrough(pts[2 * i], pts[2 * i + 1], pts[2 * ((i + 1) % n)], pts[2 * ((i + 1) % n) + 1], 'segment'); if (l && abs(sdist(l, px, py)) <= tol && withinSub(l, px, py, tol)) return true; } return false; }
  const shoelace = pts => { const n = pts.length / 2; let s = 0; for (let i = 1; i + 1 < n; i++) s += (pts[2 * i] - pts[0]) * (pts[2 * i + 3] - pts[1]) - (pts[2 * i + 2] - pts[0]) * (pts[2 * i + 1] - pts[1]); return s / 2; };   // relative to the first vertex
  const perim = pts => { const n = pts.length / 2; let s = 0; for (let i = 0; i < n; i++) s += hypot(pts[2 * ((i + 1) % n)] - pts[2 * i], pts[2 * ((i + 1) % n) + 1] - pts[2 * i + 1]); return s; };
  function selfIntersecting(pts) {   // O(n²) proper crossings of non-adjacent edges with exact orientations
    const n = pts.length / 2, P = i => [pts[2 * (i % n)], pts[2 * (i % n) + 1]];
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [P(i), P(i + 1), P(j), P(j + 1)];
      const o1 = orient(...a, ...b, ...c), o2 = orient(...a, ...b, ...d), o3 = orient(...c, ...d, ...a), o4 = orient(...c, ...d, ...b);
      if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
    }
    return false;
  }
  function convexCCW(pts) { const n = pts.length / 2; let s = 0; for (let i = 0; i < n; i++) { const o = orient(pts[2 * i], pts[2 * i + 1], pts[2 * ((i + 1) % n)], pts[2 * ((i + 1) % n) + 1], pts[2 * ((i + 2) % n)], pts[2 * ((i + 2) % n) + 1]); if (o < 0) s |= 1; if (o > 0) s |= 2; } return s !== 3 ? (s & 2 ? 1 : s & 1 ? -1 : 0) : 0; }
  function clipPoly(subj, clp) {   // Sutherland & Hodgman 1974 against a convex clip polygon (oriented counter-clockwise first)
    let cl = clp.slice(); if (shoelace(cl) < 0) { const r = []; for (let i = cl.length / 2 - 1; i >= 0; i--) r.push(cl[2 * i], cl[2 * i + 1]); cl = r; }
    let out = []; for (let i = 0; i < subj.length; i += 2) out.push([subj[i], subj[i + 1]]);
    const m = cl.length / 2;
    for (let i = 0; i < m && out.length; i++) {
      const ax = cl[2 * i], ay = cl[2 * i + 1], bx = cl[2 * ((i + 1) % m)], by = cl[2 * ((i + 1) % m) + 1], inp = out; out = [];
      const ins = p => orient(ax, ay, bx, by, p[0], p[1]) >= 0;
      const cut = (p, q) => { const l1 = lineThrough(ax, ay, bx, by), l2 = lineThrough(p[0], p[1], q[0], q[1]); const d = l1.a * l2.b - l2.a * l1.b; return [(l1.b * l2.c - l2.b * l1.c) / d, (l2.a * l1.c - l1.a * l2.c) / d]; };
      for (let j = 0; j < inp.length; j++) { const p = inp[j], q = inp[(j + 1) % inp.length]; if (ins(q)) { if (!ins(p)) out.push(cut(p, q)); out.push(q); } else if (ins(p)) out.push(cut(p, q)); }
    }
    return out.flat();
  }
  function welzl(ps, rnd) {   // minimum enclosing circle: Welzl 1991 (move-to-front, seeded shuffle), expected O(n)
    const P = ps.slice(); for (let i = P.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
    const c2 = (a, b) => ({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, r: hypot(a[0] - b[0], a[1] - b[1]) / 2 });
    const c3 = (a, b, c) => { const O = circumcenter(pt(a[0], a[1]), pt(b[0], b[1]), pt(c[0], c[1])); if (!O) { const d = [[a, b], [a, c], [b, c]].map(([p, q]) => c2(p, q)); return d.sort((x, y) => y.r - x.r)[0]; } return { x: O.x, y: O.y, r: hypot(a[0] - O.x, a[1] - O.y) }; };
    const inC = (c, p) => hypot(p[0] - c.x, p[1] - c.y) <= c.r * (1 + 1e-12) + 1e-300;
    let c = { x: P[0][0], y: P[0][1], r: 0 };
    for (let i = 1; i < P.length; i++) if (!inC(c, P[i])) {
      c = { x: P[i][0], y: P[i][1], r: 0 };
      for (let j = 0; j < i; j++) if (!inC(c, P[j])) { c = c2(P[i], P[j]); for (let k = 0; k < j; k++) if (!inC(c, P[k])) c = c3(P[i], P[j], P[k]); }
    }
    return { t: 'C', x: c.x, y: c.y, r: c.r };
  }
  function delaunay(ps, S, budget) {   // Bowyer 1981 / Watson 1981 incremental, exact in-circle test; → triangles [i, j, k] (ccw)
    const n = ps.length, M = 1e3 * S, pts = ps.concat([[-M, -M], [M, -M], [0, M]]);
    let tris = [[n, n + 1, n + 2]];
    for (let i = 0; i < n; i++) {
      const [px, py] = pts[i], bad = [], keep = [];
      for (const t of tris) { budget.n++; const [a, b, c] = t; (incircle(...pts[a], ...pts[b], ...pts[c], px, py) > 0 ? bad : keep).push(t); }
      const edges = new Map();
      for (const [a, b, c] of bad) for (const [u, v] of [[a, b], [b, c], [c, a]]) { const k = Math.min(u, v) + ':' + Math.max(u, v); edges.set(k, edges.has(k) ? null : [u, v]); }
      tris = keep;
      for (const e of edges.values()) if (e) tris.push([e[0], e[1], i]);
    }
    return tris.filter(t => t.every(v => v < n));
  }
  function bezierPts(cs, n) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n; let q = cs.map(p => [p.x, p.y]); while (q.length > 1) { const r = []; for (let j = 0; j + 1 < q.length; j++) r.push([q[j][0] + (q[j + 1][0] - q[j][0]) * t, q[j][1] + (q[j + 1][1] - q[j][1]) * t]); q = r; } out.push(q[0][0], q[0][1]); } return out; }
  function geodesicPts(A, B, D, id) {   // the Poincaré disk: the arc of the circle through A, B orthogonal to the unit circle (Beltrami 1868, Poincaré 1882)
    if (hypot(A.x, A.y) >= 1 || hypot(B.x, B.y) >= 1) { D.add('outside-disk', id); return null; }
    const o = orient(0, 0, A.x, A.y, B.x, B.y);
    const nA = A.x * A.x + A.y * A.y;
    if (o === 0 || nA === 0) return [A.x, A.y, B.x, B.y];   // through the centre: a diameter
    const O = circumcenter(A, B, pt(A.x / nA, A.y / nA));
    if (!O || abs(orient(0, 0, A.x, A.y, B.x, B.y)) < 1e-18) return [A.x, A.y, B.x, B.y];
    const r = hypot(A.x - O.x, A.y - O.y), a0 = atan2(A.y - O.y, A.x - O.x); let a1 = atan2(B.y - O.y, B.x - O.x), d = a1 - a0;
    while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;   // the short arc is the one inside the disk
    const out = []; for (let i = 0; i <= 64; i++) { const t = a0 + d * i / 64; out.push(O.x + r * cos(t), O.y + r * sin(t)); }
    return out;
  }
  function homography(from, to) {   // the projective map of 4 point pairs (DLT, 8×8 solve; Hartley & Zisserman 2004 §4.1)
    const A = [], b = [];
    for (let i = 0; i < 4; i++) { const [x, y] = from[i], [u, v] = to[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
    const h = solve(A, b); if (!h) return null;
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  }

  /* ================= the construction: compiled once (expressions), evaluated along the DAG for each set of inputs ================= */
  function prepare(spec) {
    const m = spec.model, objs = m.objects.map(o => { const kind = Object.keys(o).find(k => KINDS[k]); return { o, id: o.id, kind, v: o[kind] }; });
    const fx = {};   // compiled expressions per object
    for (const ob of objs) {
      const v = ob.v, f = {};
      if (ob.kind === 'point') { f.x = C.cx(Array.isArray(v) ? v[0] : v.x); f.y = C.cx(Array.isArray(v) ? v[1] : v.y); }
      if (ob.kind === 'pointOn') f.t = C.cx(v.t);
      if (ob.kind === 'circle' && v.r !== undefined) f.r = C.cx(v.r);
      if (ob.kind === 'conic' && v.e !== undefined) f.e = C.cx(v.e);
      if (ob.kind === 'transform') { for (const k of ['dx', 'dy', 'angle', 'factor', 'k']) if (v[k] !== undefined) f[k] = C.cx(v[k]); if (v.m) f.m = v.m.map(C.cx); }
      fx[ob.id] = f;
    }
    const sw = isObj(m.sweep) ? { var: m.sweep.var, from: C.cx(m.sweep.from), to: C.cx(m.sweep.to), samples: m.sweep.samples || 200 } : null;
    // what each object is built from (its refs, and the X of a pick near:X / far:X / other:X): the sweep rebuilds only what the loci and series need
    const ids = new Set(objs.map(ob => ob.id)), deps = new Map();
    for (const ob of objs) {
      const d = new Set(), walk = x => { if (typeof x === 'string') { const r = x.replace(/^(near|far|other):/, ''); if (r !== ob.id && ids.has(r)) d.add(r); } else if (Array.isArray(x)) x.forEach(walk); else if (isObj(x)) Object.values(x).forEach(walk); };
      if (ob.kind !== 'point') walk(ob.v); deps.set(ob.id, d);
    }
    const closure = roots => { const need = new Set(), st = roots.filter(r => ids.has(r)); while (st.length) { const r = st.pop(); if (need.has(r)) continue; need.add(r); for (const q of deps.get(r)) st.push(q); } return need; };
    return { objs, fx, sw, closure };
  }
  function diagSet() { const L = [], set = new Set(); return { list: L, set, add(code, at) { const k = code + '@' + (at || ''); if (!set.has(k)) { set.add(k); L.push(at === undefined ? { code } : { code, at }); } }, has: (c, at) => (at === undefined ? L.some(d => d.code === c) : set.has(c + '@' + at)) }; }
  /** evaluate every object in order → Map id → value; mem keeps the previous sample's picks (continuity within a sweep) */
  function evaluate(spec, prep, env, D, mem, opts) {
    const V = new Map(), tolRel = spec.model.tol || 1e-9;
    // the scale S: the largest free coordinate (≥ 1)
    let S = 1;
    const free = new Map();
    for (const ob of prep.objs) if (ob.kind === 'point') { const x = (opts && opts.random && opts.random.has(ob.id)) ? opts.random.get(ob.id)[0] : prep.fx[ob.id].x(env), y = (opts && opts.random && opts.random.has(ob.id)) ? opts.random.get(ob.id)[1] : prep.fx[ob.id].y(env); free.set(ob.id, [x, y]); if (Number.isFinite(x)) S = Math.max(S, abs(x)); if (Number.isFinite(y)) S = Math.max(S, abs(y)); }
    const tol = tolRel * S;
    const get = r => V.get(r);
    for (const ob of prep.objs) {
      const id = ob.id, v = ob.v, f = prep.fx[id];
      if (opts && opts.only && !opts.only.has(id)) continue;
      let res;
      try { res = build(ob, v, f, get, env, S, tol, D, mem, opts); } catch (e) { res = und('undefined', id); }
      if (!res) res = und('undefined', id);
      if (res.t === 'X') { D.add('undefined', id); if (res.cause === undefined) res.cause = id; }
      else if (res.t === 'P' && !res.inf && (abs(res.x) > 1e8 * S || abs(res.y) > 1e8 * S)) D.add('huge-coordinates', id);
      V.set(id, res);
    }
    return { V, S, tol };
  }
  function build(ob, v, f, get, env, S, tol, D, mem, opts) {
    const id = ob.id;
    const refs = Array.isArray(v) ? v.map(get) : null;
    const bad = xs => xs.find(x => !x || x.t === 'X' || (x.t === 'P' && x.inf));
    const fail = x => (x && x.t === 'X' ? und(x.code, x.cause) : und('point-at-infinity', id));
    switch (ob.kind) {
      case 'point': { if (opts && opts.random && opts.random.has(id)) { const [x, y] = opts.random.get(id); return pt(x, y); } const x = f.x(env), y = f.y(env); return Number.isFinite(x) && Number.isFinite(y) ? pt(x, y) : (D.add('param', id), und('param', id)); }
      case 'midpoint': { const b = bad(refs); if (b) return fail(b); return pt((refs[0].x + refs[1].x) / 2, (refs[0].y + refs[1].y) / 2); }
      case 'line': case 'segment': case 'ray': {
        const [A, B] = refs;
        if (!A || A.t === 'X') return fail(A); if (!B || B.t === 'X') return fail(B);
        if (A.inf && B.inf) return und('point-at-infinity', id);
        if (B.inf || A.inf) { const P = A.inf ? B : A, Q = A.inf ? A : B; if (ob.kind !== 'line') return und('point-at-infinity', id); return lineDir(P.x, P.y, Q.x, Q.y); }   // a line through a point at infinity: a parallel
        if (hypot(A.x - B.x, A.y - B.y) <= tol) { D.add('coincident-points', id); return und('coincident-points', id); }
        return lineThrough(A.x, A.y, B.x, B.y, ob.kind);
      }
      case 'perpBisector': { const b = bad(refs); if (b) return fail(b); const [A, B] = refs; if (hypot(A.x - B.x, A.y - B.y) <= tol) { D.add('coincident-points', id); return und('coincident-points', id); } return lineDir((A.x + B.x) / 2, (A.y + B.y) / 2, -(B.y - A.y), B.x - A.x); }
      case 'parallel': case 'perpendicular': {
        const L = get(v.to), P = get(v.through); const b = bad([L, P]); if (b) return fail(b);
        const [dx, dy] = dirOf(L); return ob.kind === 'parallel' ? lineDir(P.x, P.y, dx, dy) : lineDir(P.x, P.y, -dy, dx);
      }
      case 'angleBisector': {
        const [B, A, Cp] = v.of.map(get), b = bad([B, A, Cp]); if (b) return fail(b);
        const u1 = hypot(B.x - A.x, B.y - A.y), u2 = hypot(Cp.x - A.x, Cp.y - A.y);
        if (u1 <= tol || u2 <= tol) { D.add('coincident-points', id); return und('coincident-points', id); }
        const ax = (B.x - A.x) / u1, ay = (B.y - A.y) / u1, bx = (Cp.x - A.x) / u2, by = (Cp.y - A.y) / u2;
        let dx = ax + bx, dy = ay + by;
        if (v.external) { dx = ax - bx; dy = ay - by; }
        if (hypot(dx, dy) < 1e-12) { dx = -ay; dy = ax; }   // a straight angle: the perpendicular
        return lineDir(A.x, A.y, dx, dy);
      }
      case 'intersect': {
        const [o1, o2] = v.of.map(get); const b = bad([o1, o2]); if (b) return fail(b);
        const r = intersectAll(o1, o2, tol, S, D, id);
        if (r.coincident) return und('coincident', id);
        if (r.inf) return { t: 'P', inf: true, x: r.inf[0], y: r.inf[1] };
        if (!r.pts.length) return und('no-intersection', id);
        return pickPt(r.pts, v.pick, get, tol, D, id, mem);
      }
      case 'center': {
        const ps = v.of.map(get), b = bad(ps); if (b) return fail(b);
        const r = centre(v.kind, ps[0], ps[1], ps[2], S, D, id);
        if (v.kind === 'centroid' || r.t === 'X') return r;
        return r;
      }
      case 'centerOf': { const o = get(v.of); if (!o || o.t === 'X') return fail(o); if (o.t === 'C') return pt(o.x, o.y); if (o.t === 'L') return und('point-at-infinity', id); const I = analyse(o); if (I.type === 1 || I.type === 3) return pt(I.cx, I.cy); D.add(I.type === 2 ? 'point-at-infinity' : 'conic-degenerate', id); return und(I.type === 2 ? 'point-at-infinity' : 'conic-degenerate', id); }
      case 'focus': { const o = get(v.of); if (!o || o.t === 'X') return fail(o); const I = analyse(o); if (!I.type) { D.add('conic-degenerate', id); return und('conic-degenerate', id); } const F = I.foci[Math.min(v.index || 0, I.foci.length - 1)]; return pt(F[0], F[1]); }
      case 'foot': { const P = get(v.from), L = get(v.to), b = bad([P, L]); if (b) return fail(b); const h = sdist(L, P.x, P.y); return pt(P.x - L.a * h, P.y - L.b * h); }
      case 'pointOn': {
        const o = get(v.on); if (!o || o.t === 'X') return fail(o); const t = f.t(env); if (!Number.isFinite(t)) { D.add('param', id); return und('param', id); }
        if (o.t === 'L') { const len = hypot(o.q[0] - o.p[0], o.q[1] - o.p[1]); let s = t; if (o.sub === 'segment') s = Math.max(0, Math.min(1, t)); if (o.sub === 'ray') s = Math.max(0, t); return pt(o.p[0] + s * (o.q[0] - o.p[0]), o.p[1] + s * (o.q[1] - o.p[1])); }   // t: the fraction p → q (a segment clamps 0…1)
        if (o.t === 'C') return pt(o.x + o.r * cos(t), o.y + o.r * sin(t));   // t: the angle in radians
        if (o.t === 'K') { const I = analyse(o); if (I.type === 1) { const x = I.A * cos(t), y = I.B * sin(t); return pt(I.cx + x * cos(I.th) - y * sin(I.th), I.cy + x * sin(I.th) + y * cos(I.th)); } if (I.type === 3) { const x = I.A * cosh(t), y = I.B * sinh(t); return pt(I.cx + x * cos(I.th) - y * sin(I.th), I.cy + x * sin(I.th) + y * cos(I.th)); } if (I.type === 2) { const u = I.uv + t, [x, y] = I.rot(u, I.aa * t * t + I.vv); return pt(x, y); } D.add('conic-degenerate', id); return und('conic-degenerate', id); }
        const L = o.t === 'G' ? o.pts.concat(o.pts.slice(0, 2)) : o.t === 'U' && o.lines.length ? o.lines[0] : null;   // a polygon or a curve: t = the fraction of its length
        if (!L || L.length < 4) return und('undefined', id);
        let total = 0; for (let i = 2; i < L.length; i += 2) total += hypot(L[i] - L[i - 2], L[i + 1] - L[i - 1]);
        let want = Math.max(0, Math.min(1, t)) * total;
        for (let i = 2; i < L.length; i += 2) { const s = hypot(L[i] - L[i - 2], L[i + 1] - L[i - 1]); if (want <= s || i === L.length - 2) { const u = s ? Math.min(1, want / s) : 0; return pt(L[i - 2] + u * (L[i] - L[i - 2]), L[i - 1] + u * (L[i + 1] - L[i - 1])); } want -= s; }
        return und('undefined', id);
      }
      case 'tangent': {
        const P = get(v.from), o = get(v.to), b = bad([P, o]); if (b) return fail(b);
        if (o.t === 'L') return und('undefined', id);
        const K = o.t === 'C' ? circleConic(o) : o, M = conicMat(K.m), pol = [0, 1, 2].map(i => M[i][0] * P.x + M[i][1] * P.y + M[i][2]);
        const val = K.m[0] * P.x * P.x + K.m[1] * P.x * P.y + K.m[2] * P.y * P.y + K.m[3] * P.x + K.m[4] * P.y + K.m[5], g = hypot(pol[0], pol[1]);
        if (abs(val) <= tol * Math.max(g, 1e-300) * 2) return homLine(pol);   // on the curve: the tangent there = its polar
        const L = homLine(pol); if (!L) return und('undefined', id);
        const r = intersectAll(L, o, tol, S, { add() { } }, id);
        if (!r.pts.length) { D.add('inside-circle', id); return und('inside-circle', id); }
        const T = pickPt(r.pts, v.pick, get, tol, D, id, mem);
        return lineThrough(P.x, P.y, T.x, T.y);
      }
      case 'polar': { const P = get(v.of), o = get(v.to), b = bad([P, o]); if (b) return fail(b); if (o.t === 'L') return und('undefined', id); const K = o.t === 'C' ? circleConic(o) : o, M = conicMat(K.m); const L = homLine([0, 1, 2].map(i => M[i][0] * P.x + M[i][1] * P.y + M[i][2])); if (!L) { D.add('point-at-infinity', id); return und('point-at-infinity', id); } return L; }
      case 'radicalAxis': {
        const [c1, c2] = refs; const b = bad(refs); if (b) return fail(b);
        if (c1.t !== 'C' || c2.t !== 'C') return und('undefined', id);
        const A = 2 * (c2.x - c1.x), B = 2 * (c2.y - c1.y), Cc = (c1.x * c1.x + c1.y * c1.y - c1.r * c1.r) - (c2.x * c2.x + c2.y * c2.y - c2.r * c2.r);
        if (hypot(A, B) < tol) { D.add('concentric', id); return und('concentric', id); }
        return homLine([A, B, Cc]);
      }
      case 'eulerLine': {
        const b = bad(refs); if (b) return fail(b); const [A, B, Cp] = refs;
        const O = centre('circumcenter', A, B, Cp, S, D, id); if (O.t === 'X') return O;
        const G = pt((A.x + B.x + Cp.x) / 3, (A.y + B.y + Cp.y) / 3);
        if (hypot(O.x - G.x, O.y - G.y) <= tol) { D.add('euler-line-undefined', id); return und('euler-line-undefined', id); }
        return lineThrough(O.x, O.y, G.x, G.y);
      }
      case 'simson': {   // Simson 1797 (Wallace 1799): the feet of the perpendiculars from P to the sides are collinear iff P is on the circumcircle
        const P = get(v.point), ps = v.of.map(get), b = bad([P].concat(ps)); if (b) return fail(b);
        const feet = [[1, 2], [2, 0], [0, 1]].map(([i, j]) => { const L = lineThrough(ps[i].x, ps[i].y, ps[j].x, ps[j].y); if (!L) return null; const h = sdist(L, P.x, P.y); return [P.x - L.a * h, P.y - L.b * h]; });
        if (feet.some(x => !x)) return und('degenerate-triangle', id);
        const O = circumcenter(ps[0], ps[1], ps[2]); if (O && abs(hypot(P.x - O.x, P.y - O.y) - hypot(ps[0].x - O.x, ps[0].y - O.y)) > 1e3 * tol) D.add('not-collinear', id);
        let [F1, F2] = [feet[0], feet[1]]; if (hypot(F1[0] - F2[0], F1[1] - F2[1]) <= tol) F2 = feet[2];
        return lineThrough(F1[0], F1[1], F2[0], F2[1]) || und('coincident-points', id);
      }
      case 'circle': {
        if (v.points) { const ps = v.points.map(get), b = bad(ps); if (b) return fail(b); return triCircle('circumcircle', ps[0], ps[1], ps[2], S, D, id); }
        const Cn = get(v.center); if (!Cn || Cn.t === 'X' || Cn.inf) return fail(Cn);
        if (v.through !== undefined) { const P = get(v.through); if (!P || P.t === 'X' || P.inf) return fail(P); const r = hypot(P.x - Cn.x, P.y - Cn.y); if (r <= tol) { D.add('coincident-points', id); return und('coincident-points', id); } return { t: 'C', x: Cn.x, y: Cn.y, r }; }
        const r = f.r(env); if (!(r >= 0)) { D.add('param', id); return und('param', id); } if (r <= tol) { D.add('coincident-points', id); return und('coincident-points', id); }
        return { t: 'C', x: Cn.x, y: Cn.y, r };
      }
      case 'triCircle': { const ps = v.of.map(get), b = bad(ps); if (b) return fail(b); return triCircle(v.kind, ps[0], ps[1], ps[2], S, D, id); }
      case 'apollonius': {   // Apollonius' problem by the linear reduction: subtract the circle equations, solve x, y in r, a quadratic in r
        const cs = v.of.map(get), b = bad(cs); if (b) return fail(b); if (cs.some(c => c.t !== 'C')) return und('undefined', id);
        const sg = v.signs || [1, 1, 1], [c1] = cs, A = [], u = [], w = [];
        for (const i of [1, 2]) { const ci = cs[i]; A.push([-2 * (ci.x - c1.x), -2 * (ci.y - c1.y)]); u.push(ci.r * ci.r - c1.r * c1.r - (ci.x * ci.x + ci.y * ci.y - c1.x * c1.x - c1.y * c1.y)); w.push(2 * (sg[i] * ci.r - sg[0] * c1.r)); }
        const dt = A[0][0] * A[1][1] - A[0][1] * A[1][0]; if (abs(dt) < 1e-12 * S * S) { D.add('collinear', id); return und('collinear', id); }
        const sol = (r0, r1) => [(r0 * A[1][1] - A[0][1] * r1) / dt, (A[0][0] * r1 - r0 * A[1][0]) / dt];
        const [x0, y0] = sol(u[0], u[1]), [x1, y1] = sol(w[0], w[1]);
        const ax = x0 - c1.x, ay = y0 - c1.y;   // (ax + x1 r)² + (ay + y1 r)² = (r + s1 r1)²
        const qa = x1 * x1 + y1 * y1 - 1, qb = 2 * (ax * x1 + ay * y1) - 2 * sg[0] * c1.r, qc = ax * ax + ay * ay - c1.r * c1.r;
        const rs = quadRoots(qa, qb, qc, 0).filter(r => r > tol && cs.every((c, i) => r + sg[i] * c.r >= -tol));
        if (!rs.length) { D.add('no-solution', id); return und('no-solution', id); }
        const k = /^index:(\d)$/.test(v.pick || '') ? +v.pick.slice(6) : 0;
        if (k >= rs.length) { D.add('no-solution', id); return und('no-solution', id); }
        const r = rs[k]; return { t: 'C', x: x0 + x1 * r, y: y0 + y1 * r, r };
      }
      case 'mec': { const b = bad(refs); if (b) return fail(b); return welzl(refs.map(p => [p.x, p.y]), C.rng(spec0.model.seed || 1, 'geom:mec:' + id)); }
      case 'conic': {
        if (v.points) { const ps = v.points.map(get), b = bad(ps); if (b) return fail(b); const K = conic5(ps, S, D, id); if (K.t === 'K' && !analyse(K).type) D.add('conic-degenerate', id); return K; }
        if (v.foci) {
          const [F1, F2] = v.foci.map(get), P = get(v.through), b = bad([F1, F2, P]); if (b) return fail(b);
          const cx = (F1.x + F2.x) / 2, cy = (F1.y + F2.y) / 2, c = hypot(F2.x - F1.x, F2.y - F1.y) / 2, th = atan2(F2.y - F1.y, F2.x - F1.x), d1 = hypot(P.x - F1.x, P.y - F1.y), d2 = hypot(P.x - F2.x, P.y - F2.y);
          if (v.type === 'hyperbola') { const a = abs(d1 - d2) / 2; if (!(a > tol) || !(c - a > tol)) { D.add('conic-degenerate', id); return und('conic-degenerate', id); } return conicCanon(cx, cy, th, a, sqrt(c * c - a * a), true); }
          const a = (d1 + d2) / 2; if (!(a - c > tol)) { D.add('conic-degenerate', id); return und('conic-degenerate', id); }
          return conicCanon(cx, cy, th, a, sqrt(a * a - c * c), false);
        }
        const F = get(v.focus), L = get(v.directrix), b = bad([F, L]); if (b) return fail(b); const e = f.e(env); if (!(e > 0)) { D.add('param', id); return und('param', id); }
        if (abs(sdist(L, F.x, F.y)) <= tol) { D.add('conic-degenerate', id); return und('conic-degenerate', id); }
        const e2 = e * e;   // (x − fx)² + (y − fy)² = e²·(ax + by + c)²  (the focus–directrix definition, Pappus)
        return { t: 'K', m: normConic([1 - e2 * L.a * L.a, -2 * e2 * L.a * L.b, 1 - e2 * L.b * L.b, -2 * F.x - 2 * e2 * L.a * L.c, -2 * F.y - 2 * e2 * L.b * L.c, F.x * F.x + F.y * F.y - e2 * L.c * L.c]) };
      }
      case 'polygon': { const b = bad(refs); if (b) return fail(b); const pts = refs.flatMap(p => [p.x, p.y]); if (selfIntersecting(pts)) D.add('self-intersecting', id); return { t: 'G', pts }; }
      case 'regular': { const Cn = get(v.center), V0 = get(v.vertex), b = bad([Cn, V0]); if (b) return fail(b); const r = hypot(V0.x - Cn.x, V0.y - Cn.y); if (r <= tol) { D.add('coincident-points', id); return und('coincident-points', id); } const a0 = atan2(V0.y - Cn.y, V0.x - Cn.x), pts = []; for (let i = 0; i < v.n; i++) { const a = a0 + 2 * PI * i / v.n; pts.push(Cn.x + r * cos(a), Cn.y + r * sin(a)); } return { t: 'G', pts }; }
      case 'hull': { const b = bad(refs); if (b) return fail(b); const h = hull(refs.map(p => [p.x, p.y])); if (h.length < 3) { D.add('collinear', id); return h.length === 2 ? lineThrough(h[0][0], h[0][1], h[1][0], h[1][1], 'segment') || und('coincident-points', id) : und('coincident-points', id); } return { t: 'G', pts: h.flat() }; }
      case 'morley': {   // Morley 1899: the first Morley triangle, trilinears A' = 1 : 2cos(C/3) : 2cos(B/3) (Weisstein; Coxeter & Greitzer 1967 §2.9)
        const b = bad(refs); if (b) return fail(b); const [A, B, Cp] = refs, I = triInfo(A, B, Cp, S, D, id); if (I.degen) { D.add('degenerate-triangle', id); return und('degenerate-triangle', id); }
        const [a, bb, c] = [I.a, I.b, I.c], [Aa, Ba, Ca] = I.angles, tri = (x, y, z) => bary(A, B, Cp, a * x, bb * y, c * z, D, id);
        const P1 = tri(1, 2 * cos(Ca / 3), 2 * cos(Ba / 3)), P2 = tri(2 * cos(Ca / 3), 1, 2 * cos(Aa / 3)), P3 = tri(2 * cos(Ba / 3), 2 * cos(Aa / 3), 1);
        return { t: 'G', pts: [P1.x, P1.y, P2.x, P2.y, P3.x, P3.y] };
      }
      case 'napoleon': {   // the outer Napoleon triangle: the centres of the equilateral triangles erected outwards on the sides
        const b = bad(refs); if (b) return fail(b); const [A, B, Cp] = refs, o = orient(A.x, A.y, B.x, B.y, Cp.x, Cp.y); if (o === 0) { D.add('degenerate-triangle', id); return und('degenerate-triangle', id); }
        const sg = o > 0 ? 1 : -1, cen = (P, Q) => { const mx = (P.x + Q.x) / 2, my = (P.y + Q.y) / 2, dx = Q.x - P.x, dy = Q.y - P.y, k = 1 / (2 * sqrt(3)); return [mx + sg * dy * k, my - sg * dx * k]; };
        return { t: 'G', pts: [...cen(B, Cp), ...cen(Cp, A), ...cen(A, B)] };
      }
      case 'clip': { const b = bad(refs); if (b) return fail(b); const [P1, P2] = refs; if (!convexCCW(P2.pts)) { D.add('not-convex', id); return und('not-convex', id); } const r = clipPoly(P1.pts, P2.pts); if (r.length < 6) { D.add('no-intersection', id); return und('no-intersection', id); } return { t: 'G', pts: r }; }
      case 'transform': return transformObj(v, f, get, env, S, tol, D, id);
      case 'locus': return { t: 'U', lines: [], pending: v.of };   // filled after the evaluation, over the sweep
      case 'bezier': { const b = bad(refs); if (b) return fail(b); return { t: 'U', lines: [bezierPts(refs, 100)] }; }   // de Casteljau 1959
      case 'geodesic': { const b = bad(refs); if (b) return fail(b); const L = geodesicPts(refs[0], refs[1], D, id); return L ? { t: 'U', lines: [L] } : und('outside-disk', id); }
      case 'delaunay': case 'voronoi': {
        const b = bad(refs); if (b) return fail(b); const ps = refs.map(p => [p.x, p.y]);
        const tris = delaunay(ps, S, { n: 0 });
        if (!tris.length) { D.add('collinear', id); return und('collinear', id); }
        const segs = [];
        if (ob.kind === 'delaunay') { const seen = new Set(); for (const t of tris) for (const [u, w] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = Math.min(u, w) + ':' + Math.max(u, w); if (!seen.has(k)) { seen.add(k); segs.push([ps[u][0], ps[u][1], ps[w][0], ps[w][1]]); } } }
        else {   // Voronoi: the dual — circumcentres of adjacent triangles joined; a hull edge gives a ray outwards (clipped at 10·S)
          const cc = tris.map(t => circumcenter(pt(...ps[t[0]]), pt(...ps[t[1]]), pt(...ps[t[2]]))), byEdge = new Map();
          tris.forEach((t, i) => { for (const [u, w] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = Math.min(u, w) + ':' + Math.max(u, w); (byEdge.get(k) || byEdge.set(k, []).get(k)).push([i, u, w]); } });
          for (const L of byEdge.values()) {
            if (L.length === 2) { const a = cc[L[0][0]], c2 = cc[L[1][0]]; if (a && c2) segs.push([a.x, a.y, c2.x, c2.y]); }
            else { const [i, u, w] = L[0], a = cc[i]; if (!a) continue; const dx = ps[w][0] - ps[u][0], dy = ps[w][1] - ps[u][1], l = hypot(dx, dy); segs.push([a.x, a.y, a.x + dy / l * 10 * S, a.y - dx / l * 10 * S]); }
          }
        }
        return { t: 'T', segs, tris: tris.length };
      }
    }
    return und('undefined', id);
  }
  let spec0 = null;   // the spec of the evaluation in progress (its seed for the seeded constructions)
  function pickPt(pts, pick, get, tol, D, id, mem) {
    const P = (i, why) => { if (mem && why !== 'cont' && mem.prev.has(id)) { /* continuity is only used when asked */ } return pt(pts[i][0], pts[i][1]); };
    if (!pick || /^index:/.test(pick)) { const k = pick ? +pick.slice(6) : 0; if (k >= pts.length) { D.add('no-intersection', id); return und('no-intersection', id); } return P(k); }
    if (pick === 'continuous') {
      let k = 0;
      if (mem && mem.prev.has(id)) { const [px, py] = mem.prev.get(id); let best = Infinity; pts.forEach((q, i) => { const d = hypot(q[0] - px, q[1] - py); if (d < best) { best = d; k = i; } }); if (k !== 0) D.add('branch-switch', id); }
      if (mem) mem.next.set(id, pts[k]);
      return P(k, 'cont');
    }
    const [how, ref] = pick.split(':'), R = get(ref);
    if (!R || R.t !== 'P' || R.inf) return P(0);
    const ds = pts.map(q => hypot(q[0] - R.x, q[1] - R.y));
    if (how === 'near') return P(ds.indexOf(Math.min(...ds)));
    if (how === 'far') return P(ds.indexOf(Math.max(...ds)));
    const others = pts.map((q, i) => i).filter(i => ds[i] > 1e3 * tol);   // other: not the point Q (the second intersection)
    if (!others.length) { D.add('tangent', id); return P(0); }
    return P(others.reduce((a, b) => (ds[b] > ds[a] ? b : a)));
  }
  function transformObj(v, f, get, env, S, tol, D, id) {
    const o = get(v.of); if (!o || o.t === 'X') return o ? und(o.code, o.cause) : und('undefined', id);
    if (o.t === 'P' && o.inf) return und('point-at-infinity', id);
    const k = v.kind;
    if (k === 'invert') return invertObj(o, get(v.circle), tol, D, id);
    let H = null;   // the 3×3 matrix of the map
    if (k === 'translate') { let dx, dy; if (v.by) { const [A, B] = v.by.map(get); if (!A || !B || A.t !== 'P' || B.t !== 'P') return und('undefined', id); dx = B.x - A.x; dy = B.y - A.y; } else { dx = f.dx(env); dy = f.dy(env); } H = [[1, 0, dx], [0, 1, dy], [0, 0, 1]]; }
    else if (k === 'rotate') { const Cn = get(v.center); if (!Cn || Cn.t !== 'P' || Cn.inf) return und('undefined', id); let a = f.angle(env); if (v.deg) a = a * PI / 180; const c = cos(a), s = sin(a); H = [[c, -s, Cn.x - c * Cn.x + s * Cn.y], [s, c, Cn.y - s * Cn.x - c * Cn.y], [0, 0, 1]]; }
    else if (k === 'reflect') {
      if (v.line !== undefined) { const L = get(v.line); if (!L || L.t !== 'L') return und('undefined', id); const { a, b, c } = L; H = [[1 - 2 * a * a, -2 * a * b, -2 * a * c], [-2 * a * b, 1 - 2 * b * b, -2 * b * c], [0, 0, 1]]; }
      else { const Cn = get(v.center); if (!Cn || Cn.t !== 'P' || Cn.inf) return und('undefined', id); H = [[-1, 0, 2 * Cn.x], [0, -1, 2 * Cn.y], [0, 0, 1]]; }
    } else if (k === 'dilate') { const Cn = get(v.center); if (!Cn || Cn.t !== 'P' || Cn.inf) return und('undefined', id); const s = f.factor(env); H = [[s, 0, Cn.x * (1 - s)], [0, s, Cn.y * (1 - s)], [0, 0, 1]]; }
    else if (k === 'shear') { const s = f.k(env); H = [[1, s, 0], [0, 1, 0], [0, 0, 1]]; }
    else if (k === 'affine') { const mm = f.m.map(g => g(env)); H = [[mm[0], mm[1], mm[2]], [mm[3], mm[4], mm[5]], [0, 0, 1]]; }
    else if (k === 'projective') { const A = v.from.map(get), B = v.to.map(get); if ([...A, ...B].some(p => !p || p.t !== 'P' || p.inf)) return und('undefined', id); H = homography(A.map(p => [p.x, p.y]), B.map(p => [p.x, p.y])); if (!H) { D.add('collinear', id); return und('collinear', id); } }
    if (!H || !H.flat().every(Number.isFinite)) { D.add('param', id); return und('param', id); }
    const dt = H[0][0] * H[1][1] - H[0][1] * H[1][0];
    if (abs(det3(H)) < 1e-14) { D.add('param', id); return und('param', id); }
    const ap = (x, y) => applyH(H, x, y);
    if (o.t === 'P') { const [x, y] = ap(o.x, o.y); return pt(x, y); }
    if (o.t === 'L') { const p = ap(...o.p), q = ap(...o.q); return lineThrough(p[0], p[1], q[0], q[1], o.sub) || und('undefined', id); }
    if (o.t === 'C' && ['translate', 'rotate', 'reflect', 'dilate'].includes(k)) { const [x, y] = ap(o.x, o.y); return { t: 'C', x, y, r: o.r * sqrt(abs(dt)) }; }
    if (o.t === 'C' || o.t === 'K') { const K = o.t === 'C' ? circleConic(o) : o, Hi = inv3(H); if (!Hi) return und('param', id); return { t: 'K', m: normConic(matConic(mul3(tr3(Hi), mul3(conicMat(K.m), Hi)))) }; }   // C' = H⁻ᵀ C H⁻¹
    const mapL = L => { const r = []; for (let i = 0; i < L.length; i += 2) { const [x, y] = ap(L[i], L[i + 1]); r.push(x, y); } return r; };
    if (o.t === 'G') return { t: 'G', pts: mapL(o.pts) };
    if (o.t === 'U') return { t: 'U', lines: o.lines.map(mapL) };
    if (o.t === 'T') return { t: 'T', segs: o.segs.map(mapL) };
    return und('undefined', id);
  }
  // inversion in a circle (Steiner 1824; Coxeter & Greitzer 1967 ch. 5): P ↦ c + k²(P − c)/|P − c|²; generalised circles to generalised circles
  function invertObj(o, ci, tol, D, id) {
    if (!ci || ci.t !== 'C') return und('undefined', id);
    const cx = ci.x, cy = ci.y, k2 = ci.r * ci.r;
    const inv = (x, y) => { const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy; return d2 <= tol * tol ? null : [cx + k2 * dx / d2, cy + k2 * dy / d2]; };
    if (o.t === 'P') { const r = inv(o.x, o.y); if (!r) { D.add('inversion-centre', id); D.add('point-at-infinity', id); return und('inversion-centre', id); } return pt(r[0], r[1]); }
    if (o.t === 'L' && o.sub === 'line') {
      const h = sdist(o, cx, cy);
      if (abs(h) <= tol) return lineThrough(o.p[0], o.p[1], o.q[0], o.q[1]);   // a line through the centre is its own image
      const fx = cx - o.a * h, fy = cy - o.b * h, s = k2 / (2 * h * h);   // the image: the circle through c with its diameter toward the foot
      return { t: 'C', x: cx + s * (fx - cx), y: cy + s * (fy - cy), r: k2 / (2 * abs(h)) };
    }
    if (o.t === 'C') {
      const dx = o.x - cx, dy = o.y - cy, d = hypot(dx, dy), den = d * d - o.r * o.r;
      if (abs(d - o.r) <= tol) {   // through the centre: a line, perpendicular to c→o at k²/(2r)
        if (d <= tol) return und('undefined', id);
        const ux = dx / d, uy = dy / d, t = k2 / (2 * o.r); return lineDir(cx + t * ux, cy + t * uy, -uy, ux);
      }
      const s = k2 / den; return { t: 'C', x: cx + s * dx, y: cy + s * dy, r: abs(s) * o.r };
    }
    // segments, rays, polygons, curves: sampled, split where they pass the centre
    const lines = [];
    const sampleL = L => { let cur = []; for (let i = 0; i < L.length; i += 2) { const r = inv(L[i], L[i + 1]); if (r) cur.push(r[0], r[1]); else { if (cur.length >= 4) lines.push(cur); cur = []; } } if (cur.length >= 4) lines.push(cur); };
    const dense = (L, closed) => { const out = []; const n = L.length / 2, m = closed ? n : n - 1; for (let i = 0; i < m; i++) { const x1 = L[2 * i], y1 = L[2 * i + 1], x2 = L[2 * ((i + 1) % n)], y2 = L[2 * ((i + 1) % n) + 1]; for (let j = 0; j < 64; j++) out.push(x1 + (x2 - x1) * j / 64, y1 + (y2 - y1) * j / 64); } if (!closed) out.push(L[L.length - 2], L[L.length - 1]); else out.push(L[0], L[1]); return out; };
    if (o.t === 'L') { const len = o.sub === 'segment' ? hypot(o.q[0] - o.p[0], o.q[1] - o.p[1]) : 100 * Math.max(1, ci.r); const [dx, dy] = dirOf(o); sampleL(dense([o.p[0], o.p[1], o.p[0] + dx * len, o.p[1] + dy * len], false)); }
    else if (o.t === 'G') sampleL(dense(o.pts, true));
    else if (o.t === 'U') for (const L of o.lines) sampleL(L);
    else if (o.t === 'K') for (const L of conicPoints(o, analyse(o), [cx - 10 * ci.r, cx + 10 * ci.r, cy - 10 * ci.r, cy + 10 * ci.r], 256)) sampleL(L);
    else return und('undefined', id);
    return { t: 'U', lines };
  }

  /* ---------- measures and asserts (tolerances relative to S: lengths 1e-9·S, angles 1e-9 rad) ---------- */
  function angleAt(B, A, Cp, oriented) { const ux = B.x - A.x, uy = B.y - A.y, vx = Cp.x - A.x, vy = Cp.y - A.y, a = atan2(ux * vy - uy * vx, ux * vx + uy * vy); return oriented ? a : abs(a); }   // atan2(cross, dot): no loss near 0 and π
  function isPt(p) { return p && p.t === 'P' && !p.inf; }
  function residualOf(test, xs, S) {   // → {res, scale}: the assert holds when |res| ≤ tol·scale
    const ok = xs.every(x => x && x.t !== 'X' && !(x.t === 'P' && x.inf)); if (!ok) return null;
    if (test === 'collinear') { const [A, B] = xs; let worst = 0; const L = lineThrough(A.x, A.y, B.x, B.y); if (!L) return { res: 0, scale: S }; for (const P of xs.slice(2)) worst = Math.max(worst, abs(sdist(L, P.x, P.y))); return { res: worst, scale: S }; }
    if (test === 'concyclic') { const [A, B, Cp, Dd] = xs, O = circumcenter(A, B, Cp); if (!O) return { res: Infinity, scale: S }; return { res: abs(hypot(Dd.x - O.x, Dd.y - O.y) - hypot(A.x - O.x, A.y - O.y)), scale: S }; }
    if (test === 'concurrent') { const [l1, l2, l3] = xs, d = l1.a * l2.b - l2.a * l1.b; if (abs(d) < 1e-12) return { res: Infinity, scale: S }; const x = (l1.b * l2.c - l2.b * l1.c) / d, y = (l2.a * l1.c - l1.a * l2.c) / d; return { res: abs(sdist(l3, x, y)), scale: S }; }
    if (test === 'parallel') { const [l1, l2] = xs; return { res: abs(l1.a * l2.b - l2.a * l1.b), scale: 1 }; }
    if (test === 'perpendicular') { const [l1, l2] = xs; return { res: abs(l1.a * l2.a + l1.b * l2.b), scale: 1 }; }
    if (test === 'equal') { const [A, B, Cp, Dd] = xs; return { res: abs(hypot(A.x - B.x, A.y - B.y) - hypot(Cp.x - Dd.x, Cp.y - Dd.y)), scale: S }; }
    if (test === 'on') { const [P, o] = xs; return { res: distTo(P, o), scale: S }; }
    if (test === 'tangent') {
      const [a, b] = xs;
      if (a.t === 'L' || b.t === 'L') { const L = a.t === 'L' ? a : b, c = a.t === 'L' ? b : a; return { res: abs(abs(sdist(L, c.x, c.y)) - c.r), scale: S }; }
      const d = hypot(a.x - b.x, a.y - b.y); return { res: Math.min(abs(d - (a.r + b.r)), abs(d - abs(a.r - b.r))), scale: S };
    }
    return null;
  }
  function distTo(P, o) {
    if (o.t === 'P') return hypot(P.x - o.x, P.y - o.y);
    if (o.t === 'L') { if (o.sub === 'line') return abs(sdist(o, P.x, P.y)); const s = paramOn(o, P.x, P.y), len = hypot(o.q[0] - o.p[0], o.q[1] - o.p[1]); const ss = Math.max(0, o.sub === 'ray' ? s : Math.min(len, s)); const [dx, dy] = dirOf(o); return hypot(P.x - o.p[0] - ss * dx, P.y - o.p[1] - ss * dy); }
    if (o.t === 'C') return abs(hypot(P.x - o.x, P.y - o.y) - o.r);
    if (o.t === 'K') { const m = o.m, v = m[0] * P.x * P.x + m[1] * P.x * P.y + m[2] * P.y * P.y + m[3] * P.x + m[4] * P.y + m[5], g = hypot(2 * m[0] * P.x + m[1] * P.y + m[3], m[1] * P.x + 2 * m[2] * P.y + m[4]); return g > 0 ? abs(v) / g : abs(v) === 0 ? 0 : Infinity; }   // first-order (Sampson) distance
    const Ls = o.t === 'G' ? [o.pts.concat(o.pts.slice(0, 2))] : o.t === 'U' ? o.lines : [];
    let best = Infinity; for (const L of Ls) for (let i = 2; i < L.length; i += 2) { const l = lineThrough(L[i - 2], L[i - 1], L[i], L[i + 1], 'segment'); best = Math.min(best, l ? distTo(P, l) : hypot(P.x - L[i], P.y - L[i + 1])); }
    return best;
  }
  function measure(o, V, S, tol, D) {
    const xs = (o.at || []).map(r => V.get(r)), deg = o.unit !== 'rad';
    const live = xs.every(x => x && x.t !== 'X');
    switch (o.of) {
      case 'x': case 'y': return isPt(xs[0]) ? xs[0][o.of] : NaN;
      case 'dist': return live && isPt(xs[0]) && !(xs[1].t === 'P' && xs[1].inf) ? (xs[1].t === 'P' ? hypot(xs[0].x - xs[1].x, xs[0].y - xs[1].y) : xs[1].t === 'L' ? distTo(xs[0], { ...xs[1], sub: 'line' }) : distTo(xs[0], xs[1])) : NaN;
      case 'length': if (!live) return NaN; if (xs.length === 1) return xs[0].t === 'L' && xs[0].sub === 'segment' ? hypot(xs[0].q[0] - xs[0].p[0], xs[0].q[1] - xs[0].p[1]) : NaN; return isPt(xs[0]) && isPt(xs[1]) ? hypot(xs[0].x - xs[1].x, xs[0].y - xs[1].y) : NaN;
      case 'angle': {
        if (!live) return NaN;
        let a;
        if (xs.length === 3) { if (!xs.every(isPt)) return NaN; if (hypot(xs[0].x - xs[1].x, xs[0].y - xs[1].y) <= tol || hypot(xs[2].x - xs[1].x, xs[2].y - xs[1].y) <= tol) return NaN; a = angleAt(xs[0], xs[1], xs[2], o.oriented === true); }
        else { if (xs[0].t !== 'L' || xs[1].t !== 'L') return NaN; const [ux, uy] = dirOf(xs[0]), [vx, vy] = dirOf(xs[1]); a = atan2(ux * vy - uy * vx, ux * vx + uy * vy); if (!o.oriented) { a = abs(a); if (a > PI / 2) a = PI - a; } }
        return deg ? a * 180 / PI : a;
      }
      case 'area': {
        if (!live) return NaN; let a;
        if (xs.length === 1 && xs[0].t === 'G') a = shoelace(xs[0].pts);
        else if (xs.length === 1 && xs[0].t === 'C') a = PI * xs[0].r * xs[0].r;
        else if (xs.length === 1 && xs[0].t === 'K') { const I = analyse(xs[0]); a = I.type === 1 ? PI * I.A * I.B : NaN; }
        else if (xs.every(isPt)) a = shoelace(xs.flatMap(p => [p.x, p.y]));
        else return NaN;
        return o.signed ? a : abs(a);
      }
      case 'perimeter': if (!live) return NaN; if (xs.length === 1 && xs[0].t === 'G') return perim(xs[0].pts); if (xs.length === 1 && xs[0].t === 'C') return 2 * PI * xs[0].r; return xs.every(isPt) ? perim(xs.flatMap(p => [p.x, p.y])) : NaN;
      case 'radius': return live && xs[0].t === 'C' ? xs[0].r : NaN;
      case 'slope': return live && xs[0].t === 'L' ? (abs(xs[0].b) < 1e-15 ? NaN : -xs[0].a / xs[0].b) : NaN;
      case 'eccentricity': if (!live) return NaN; if (xs[0].t === 'C') return 0; if (xs[0].t !== 'K') return NaN; { const I = analyse(xs[0]); return I.type ? I.e : NaN; }
      case 'conicType': if (!live) return NaN; if (xs[0].t === 'C') return 1; if (xs[0].t !== 'K') return NaN; return analyse(xs[0]).type;
      case 'count': { if (!live || xs.some(x => x.t === 'P')) return NaN; const r = intersectAll(xs[0], xs[1], tol, S, { add() { } }, ''); return r.coincident ? NaN : r.pts.length; }
      case 'power': return live && isPt(xs[0]) && xs[1].t === 'C' ? (xs[0].x - xs[1].x) ** 2 + (xs[0].y - xs[1].y) ** 2 - xs[1].r * xs[1].r : NaN;
      case 'orient': return live && xs.every(isPt) ? Math.sign(orient(xs[0].x, xs[0].y, xs[1].x, xs[1].y, xs[2].x, xs[2].y)) : NaN;   // exact
      case 'inside': { if (!live || !isPt(xs[0])) return NaN; const P = xs[0], o2 = xs[1]; if (o2.t === 'C') return hypot(P.x - o2.x, P.y - o2.y) < o2.r - tol ? 1 : 0; if (o2.t !== 'G') return NaN; return !onBoundary(P.x, P.y, o2.pts, tol) && winding(P.x, P.y, o2.pts) !== 0 ? 1 : 0; }
      case 'crossRatio': {   // (A, B; C, D) = (AC·BD)/(BC·AD), signed along the line
        if (!live || !xs.every(isPt)) return NaN; const L = lineThrough(xs[0].x, xs[0].y, xs[1].x, xs[1].y); if (!L) return NaN;
        if (xs.some(P => abs(sdist(L, P.x, P.y)) > 1e3 * tol)) { D.add('not-collinear'); return NaN; }
        const [a, b, c, d] = xs.map(P => paramOn(L, P.x, P.y)); return ((c - a) * (d - b)) / ((c - b) * (d - a));
      }
      case 'defined': return xs[0] && xs[0].t !== 'X' && !(xs[0].t === 'P' && xs[0].inf) ? 1 : 0;
      default: {
        if (!ASSERTS.includes(o.of)) return NaN;
        const r = residualOf(o.of, xs, S); return r ? (r.res <= ((spec0 && spec0.model.tol) || 1e-9) * r.scale ? 1 : 0) : NaN;
      }
    }
  }

  /* ---------- the scene ---------- */
  function drawing(prep, V, view, o) {
    const sc = C.scene(view), Wd = view[1] - view[0], lab = o.labels !== 'none';
    for (const ob of prep.objs) {
      if (ob.o.hide) continue;
      const x = V.get(ob.id); if (!x || x.t === 'X') continue;
      const c = ob.o.c, label = ob.o.label ? { key: ob.o.label } : lab ? { s: ob.id } : {};
      if (x.t === 'P') { if (!x.inf) sc.pt(x.x, x.y, Object.assign({ c: c || (ob.kind === 'point' ? 'hi' : 'base'), r: ob.kind === 'point' ? 5 : 4 }, label)); }
      else if (x.t === 'L') { const s = clipLine(x, view); if (s) sc.seg(s[0], s[1], s[2], s[3], { c: c || (x.sub === 'segment' ? 'base' : 'muted'), w: x.sub === 'segment' ? 2 : 1.5 }); }
      else if (x.t === 'C') sc.circ(x.x, x.y, x.r, { c: c || 'info' });
      else if (x.t === 'K') for (const L of conicPoints(x, analyse(x), view, 240)) sc.poly(L, { c: c || 'info', closed: false });
      else if (x.t === 'G') sc.poly(x.pts.slice(), { c: c || 'ok', closed: true, fill: true });
      else if (x.t === 'U') for (const L of x.lines) { const l2 = L.length > 4000 ? C.thin(L.reduce((a, v, i) => (i % 2 ? a : a.concat([[L[i], L[i + 1]]])), []), 2000).flat() : L; sc.poly(l2, { c: c || 'warn', closed: false }); }
      else if (x.t === 'T') for (const s of x.segs) sc.seg(s[0], s[1], s[2], s[3], { c: c || 'muted', w: 1 });
    }
    return sc.done();
  }
  function viewOf(prep, V) {
    const xs = [], ys = [];
    for (const ob of prep.objs) { const x = V.get(ob.id); if (!x || ob.o.hide) continue; if (x.t === 'P' && !x.inf) { xs.push(x.x); ys.push(x.y); } else if (x.t === 'C') { xs.push(x.x - x.r, x.x + x.r); ys.push(x.y - x.r, x.y + x.r); } else if (x.t === 'G') for (let i = 0; i < x.pts.length; i += 2) { xs.push(x.pts[i]); ys.push(x.pts[i + 1]); } }
    return C.fitView(xs, ys, 0.15);
  }

  /* ---------- the run ---------- */
  function run(spec, env, opts) {
    spec0 = spec;
    const prep = (opts && opts.prepared) || prepare(spec), D = diagSet(), out = {}, m = spec.model;
    env = Object.assign({}, env || {});
    if (prep.sw && !(prep.sw.var in env)) env[prep.sw.var] = prep.sw.from(env);   // outside the sweep its variable stands at `from`
    const base = evaluate(spec, prep, env, D, null, null);
    let V = base.V;
    const sw = prep.sw, outs = Array.isArray(spec.outputs) ? spec.outputs : [];
    // the sweep: loci, and the series of measures against the driver
    const loci = prep.objs.filter(ob => ob.kind === 'locus'), series = outs.filter(o => o && o.kind === 'series');
    if (sw && (loci.length || series.length)) {
      const a = sw.from(env), b = sw.to(env), n = sw.samples;
      const ser = series.map(() => []), lines = loci.map(() => [[]]), mem = { prev: new Map(), next: new Map() };
      const only = prep.closure ? { only: prep.closure(loci.map(ob => ob.v.of).concat(...series.map(o => o.at || []))) } : null;
      if (!Number.isFinite(a) || !Number.isFinite(b)) D.add('param');
      else for (let i = 0; i < n; i++) {
        const u = a + (b - a) * i / (n - 1), e2 = Object.assign({}, env, { [sw.var]: u }), Dx = diagSet();
        mem.next = new Map();
        const r = evaluate(spec, prep, e2, Dx, mem, only);
        mem.prev = mem.next;
        for (const d of Dx.list) if (d.code === 'branch-switch') D.add('branch-switch', d.at);
        series.forEach((o, j) => { ser[j].push(o.of === 'sweep' ? u : measure(o, r.V, r.S, r.tol, Dx)); });
        loci.forEach((ob, j) => {
          const P = r.V.get(ob.v.of), L = lines[j], cur = L[L.length - 1];
          if (!P || P.t !== 'P' || P.inf) { if (cur.length) L.push([]); return; }
          if (cur.length >= 2 && hypot(P.x - cur[cur.length - 2], P.y - cur[cur.length - 1]) > 0.1 * r.S * Math.max(1, 200 / n)) L.push([]);
          L[L.length - 1].push(P.x, P.y);
        });
      }
      series.forEach((o, j) => { out[o.id] = ser[j]; });
      loci.forEach((ob, j) => { const L = lines[j].filter(l => l.length >= 4); if (L.length > 1) D.add('locus-gaps', ob.id); V.set(ob.id, { t: 'U', lines: L }); });
    }
    for (const o of outs) {
      if (!o || typeof o.id !== 'string' || o.kind === 'series') continue;
      if (o.kind === 'scalar') {
        if (o.of === 'flag') out[o.id] = (o.at && o.at.length ? D.has(o.code, o.at[0]) || (V.get(o.at[0]) && V.get(o.at[0]).t === 'X' && V.get(o.at[0]).code === o.code) : D.has(o.code)) ? 1 : 0;
        else if (o.of === 'residual') { const r = residualOf(o.test, (o.at || []).map(x => V.get(x)), base.S); out[o.id] = r ? r.res : NaN; }
        else if (o.of === 'always') out[o.id] = always(spec, prep, env, o, D);
        else { try { out[o.id] = measure(o, V, base.S, base.tol, D); } catch (err) { out[o.id] = NaN; D.add('undefined', o.id); } }   // an unchecked spec: a value, never a throw
      } else if (o.kind === 'scene') out[o.id] = drawing(prep, V, Array.isArray(m.view) ? m.view : viewOf(prep, V), o);
    }
    spec0 = null;
    return { out, diag: D.list, values: V, S: base.S };
  }
  /** "is it always true?": the assert on seeded random placements of the free points (probabilistic proving; Schwartz 1980, Zippel 1979) */
  function always(spec, prep, env, o, D) {
    const rnd = C.rng(spec.model.seed || 1, 'geom:always:' + o.id), n = o.samples || 20, base = evaluate(spec, prep, env, diagSet(), null, null);
    const frees = prep.objs.filter(ob => ob.kind === 'point').map(ob => ob.id);
    let ok = 0, tried = 0;
    for (let i = 0; i < n; i++) {
      const R = new Map(); for (const id of frees) R.set(id, [(rnd() * 2 - 1) * base.S, (rnd() * 2 - 1) * base.S]);
      const r = evaluate(spec, prep, env, diagSet(), null, { random: R });
      const res = residualOf(o.test, (o.at || []).map(x => r.V.get(x)), r.S);
      if (!res) continue;
      tried++; if (res.res <= (spec.model.tol || 1e-9) * res.scale * 1e3) ok++;   // random placements are less well conditioned: 1000× the tolerance
    }
    return tried ? (ok === tried ? 1 : 0) : NaN;
  }

  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  engine.workerSource = C.workerSource(noemaLibGeomModule, 'NoemaLibGeom', { kit: true });
  root.NoemaLibGeom = Object.freeze({
    table: { model: Object.assign({ objects: { $req: true, $list: { $obj: Object.assign({ id: 'id!', hide: 'bool', label: 'key', c: 'enum:' + ROLES.join('|') }, ...KIND_NAMES.map(k => ({ [k]: KINDS[k].point ? 'any' : KINDS[k].list ? { $list: 'ref', min: KINDS[k].min, max: KINDS[k].max } : { $obj: KINDS[k].T } }))) }, min: 1, max: MAX_OBJ } }, MODEL_T), outputs: { scalar: SCALAR_OF, series: SERIES_OF, scene: ['drawing'] }, fields: { at: { $list: 'ref' }, unit: 'enum:deg|rad', oriented: 'bool', signed: 'bool', code: 'enum:' + CODES.join('|'), test: 'enum:' + ASSERTS.join('|'), samples: 'int:1:200', labels: 'enum:id|none' } },   // the form of the activity author (46_lib_schema.js)
    id: ID, checkSpec, exprs, keys, run, prepare, engine: Object.freeze(engine), simEngine,
    KINDS: KIND_NAMES, CENTRES, TRICIRCLES, TRANSFORMS, CODES, SCALAR_OF, SERIES_OF, ASSERTS,
    // the geometry itself, for the tests
    orient, incircle, RP, quadRoots, cubicRoots, interLL, interLC, interCC, centre, triCircle, conic5, analyse, hull, winding, shoelace, welzl, delaunay, homography,
    lineThrough, angleAt, invertObj, diagSet,
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
