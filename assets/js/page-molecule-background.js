/**
 * assets/js/page-molecule-background.js
 *
 * Fetches and parses an .xyz coordinate file, then renders it as a small
 * ball-and-stick 3D scene sitting fixed behind every page's content.
 *
 * Works for a single molecule OR a large cluster of many separate
 * molecules in one file: molecule boundaries aren't read from the file
 * (the .xyz format has no such concept) — they're detected automatically
 * by treating each connected group of bonded atoms as one molecule
 * (union-find over the same bond graph used for rendering). An isolated
 * atom with no bonds (e.g. a monatomic ion) simply becomes its own
 * one-atom "molecule".
 *
 * Each detected molecule gets its own independent motion: a constant
 * slow auto-rotation (random axis/speed per molecule) plus a tilt toward
 * wherever the mouse is (random responsiveness/settling speed per
 * molecule), so a large cluster reads as a living field of independently
 * drifting molecules rather than one rigid block turning as a whole.
 *
 * Configured from _config.yml (see the `page_background_*` keys) via the
 * `window.pageBackground` object set in _includes/scripts.liquid.
 */
(function () {
  var config = window.pageBackground;
  if (!config || !config.moleculeUrl || typeof THREE === "undefined") return;

  var ELEMENT_COLORS = {
    H: 0xcccccc, C: 0x444444, N: 0x3050f8, O: 0xff0d0d, F: 0x90e050,
    P: 0xff8000, S: 0xffff30, CL: 0x1ff01f, BR: 0xa62929, I: 0x940094,
    NA: 0xab5cf2, K: 0x8f40d4, MG: 0x8aff00, CA: 0x3dff00,
  };
  var COVALENT_RADII = {
    H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57,
    P: 1.07, S: 1.05, CL: 1.02, BR: 1.2, I: 1.39,
    NA: 1.66, K: 2.03, MG: 1.41, CA: 1.76,
  };

  function elementColor(el) { return ELEMENT_COLORS[(el || "").toUpperCase()] || 0xff69b4; }
  function covalentRadius(el) { return COVALENT_RADII[(el || "").toUpperCase()] || 0.75; }

  function parseXYZ(text) {
    var lines = text.trim().split(/\r?\n/);
    var count = parseInt(lines[0].trim(), 10);
    var atoms = [];
    for (var i = 2; i < 2 + count && i < lines.length; i++) {
      var parts = lines[i].trim().split(/\s+/);
      if (parts.length < 4) continue;
      atoms.push({
        element: parts[0],
        x: parseFloat(parts[1]),
        y: parseFloat(parts[2]),
        z: parseFloat(parts[3]),
      });
    }
    return atoms;
  }

  function findBonds(atoms) {
    var bonds = [];
    for (var i = 0; i < atoms.length; i++) {
      for (var j = i + 1; j < atoms.length; j++) {
        var a = atoms[i], b = atoms[j];
        var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var threshold = (covalentRadius(a.element) + covalentRadius(b.element)) * 1.3;
        if (dist > 0.01 && dist < threshold) bonds.push([i, j]);
      }
    }
    return bonds;
  }

  // Union-find over the bond graph: each connected component is one
  // molecule. This is what lets the renderer work on any .xyz file,
  // whether it's one molecule or hundreds packed into a cluster.
  function groupIntoMolecules(atoms, bonds) {
    var parent = atoms.map(function (_, i) { return i; });
    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function union(a, b) {
      var ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    }
    bonds.forEach(function (pair) { union(pair[0], pair[1]); });

    var groups = {};
    atoms.forEach(function (_, i) {
      var root = find(i);
      if (!groups[root]) groups[root] = [];
      groups[root].push(i);
    });
    return Object.keys(groups).map(function (k) { return groups[k]; });
  }

  function centerAndScale(atoms, targetRadius) {
    var cx = 0, cy = 0, cz = 0;
    atoms.forEach(function (a) { cx += a.x; cy += a.y; cz += a.z; });
    cx /= atoms.length; cy /= atoms.length; cz /= atoms.length;

    var maxDist = 0;
    atoms.forEach(function (a) {
      a.x -= cx; a.y -= cy; a.z -= cz;
      var d = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      if (d > maxDist) maxDist = d;
    });

    var scale = maxDist > 0 ? targetRadius / maxDist : 1;
    atoms.forEach(function (a) { a.x *= scale; a.y *= scale; a.z *= scale; });
    return scale;
  }

  function init(atoms) {
    var bonds = findBonds(atoms);
    var moleculeIndexGroups = groupIntoMolecules(atoms, bonds);

    // Adaptive framing: a single small molecule and a 500-molecule
    // cluster need very different scale/camera distance to both look
    // right, so both are derived from how many molecules were found
    // rather than a fixed constant.
    var moleculeCount = moleculeIndexGroups.length;
    var targetRadius = Math.max(5, Math.sqrt(moleculeCount) * 2);
    var scale = centerAndScale(atoms, targetRadius);

    var limit = config.moleculeLimit;
    if (limit && moleculeIndexGroups.length > limit) {
      moleculeIndexGroups = moleculeIndexGroups.slice(0, limit);
    }

    var canvas = document.createElement("canvas");
    canvas.id = "page-background";
    document.body.insertBefore(canvas, document.body.firstChild);

    var style = document.createElement("style");
    style.textContent =
      "#page-background {" +
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%;" +
      "filter: blur(" + config.blur + "px);" +
      "opacity: " + config.opacity + ";" +
      "pointer-events: none;" +
      "}";
    document.head.appendChild(style);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = targetRadius * 2.8;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    // Fewer segments per sphere than a single-molecule close-up needs —
    // with potentially hundreds of molecules on screen at once (each its
    // own draw calls), this keeps the total triangle count reasonable.
    var sphereGeo = new THREE.SphereGeometry(1, 8, 8);
    var bondGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
    var bondMaterial = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
    var up = new THREE.Vector3(0, 1, 0);

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var molecules = []; // { group, autoAxisX, autoAxisY, autoSpeed, responsiveness, lerpSpeed }

    moleculeIndexGroups.forEach(function (indices) {
      // Each molecule's own centroid becomes its local pivot, so it
      // rotates around itself rather than around the whole scene's origin.
      var cx = 0, cy = 0, cz = 0;
      indices.forEach(function (i) {
        cx += atoms[i].x; cy += atoms[i].y; cz += atoms[i].z;
      });
      cx /= indices.length; cy /= indices.length; cz /= indices.length;

      var group = new THREE.Group();
      group.position.set(cx, cy, cz);
      scene.add(group);

      indices.forEach(function (i) {
        var a = atoms[i];
        var mesh = new THREE.Mesh(sphereGeo, new THREE.MeshPhongMaterial({ color: elementColor(a.element) }));
        var r = covalentRadius(a.element) * scale * 0.5;
        mesh.scale.set(r, r, r);
        mesh.position.set(a.x - cx, a.y - cy, a.z - cz);
        group.add(mesh);
      });

      var indexSet = {};
      indices.forEach(function (i) { indexSet[i] = true; });
      bonds.forEach(function (pair) {
        if (!indexSet[pair[0]] || !indexSet[pair[1]]) return;
        var a = atoms[pair[0]], b = atoms[pair[1]];
        var start = new THREE.Vector3(a.x - cx, a.y - cy, a.z - cz);
        var end = new THREE.Vector3(b.x - cx, b.y - cy, b.z - cz);
        var dir = new THREE.Vector3().subVectors(end, start);
        var length = dir.length();

        var mesh = new THREE.Mesh(bondGeo, bondMaterial);
        mesh.scale.set(1, length, 1);
        mesh.position.copy(start).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
        group.add(mesh);
      });

      molecules.push({
        group: group,
        autoAxisX: Math.random() - 0.5,
        autoAxisY: Math.random() - 0.5,
        autoSpeed: reduceMotion ? 0 : 0.0005 + Math.random() * 0.0015,
        responsiveness: 0.6 + Math.random() * 0.8,
        lerpSpeed: 0.02 + Math.random() * 0.06,
      });
    });

    // Mouse tracking is global (window-level), not canvas-level, so it
    // keeps working no matter what element is under the cursor — the
    // canvas's pointer-events: none only stops it from blocking clicks,
    // it doesn't stop us from reading the cursor position.
    var mouseNX = 0, mouseNY = 0;
    if (!reduceMotion) {
      window.addEventListener(
        "mousemove",
        function (e) {
          mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
          mouseNY = (e.clientY / window.innerHeight) * 2 - 1;
        },
        { passive: true }
      );
    }

    window.addEventListener("resize", function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
      requestAnimationFrame(animate);
      molecules.forEach(function (m) {
        m.group.rotation.x += m.autoAxisX * m.autoSpeed;
        m.group.rotation.y += m.autoAxisY * m.autoSpeed;
        if (!reduceMotion) {
          var targetX = mouseNY * config.mouseStrength * m.responsiveness;
          var targetY = mouseNX * config.mouseStrength * m.responsiveness;
          m.group.rotation.x += (targetX - m.group.rotation.x) * m.lerpSpeed;
          m.group.rotation.y += (targetY - m.group.rotation.y) * m.lerpSpeed;
        }
      });
      renderer.render(scene, camera);
    }
    animate();
  }

  fetch(config.moleculeUrl)
    .then(function (res) { return res.text(); })
    .then(function (text) {
      var atoms = parseXYZ(text);
      if (atoms.length === 0) {
        console.warn("page-molecule-background: no atoms parsed from", config.moleculeUrl);
        return;
      }
      init(atoms);
    })
    .catch(function (err) {
      console.warn("page-molecule-background: failed to load/parse xyz file", err);
    });
})();
