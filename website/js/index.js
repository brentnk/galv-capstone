function handleSearch(e) {
  if(e.keyCode === 13) {
    var term = document.getElementById('searchBox')
    console.log('handleSearch() ' + term.value)
    searchTerms(term.value)
    term.value = ''
  }
}

var map = L.map("map-canvas",{
  center:[39.7047, -105.0814],
  zoom:11,
  minZoom:10,
  maxZoom:11
});
// L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
//   { attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://cartodb.com/attributions">CartoDB</a>' }
// ).addTo(map);

L.tileLayer('http://{s}.tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png', {
	attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

var valueAlgorithm = 'sumScaledCounter';
var options = {
  radiusRange: [8,8],
  radius: 8,
  opacity: 0.57,
  lng: function(d){ return d[1]; },
  lat: function(d){ return d[2]; },
  value: uniqueCellCounter,
  valueFloor: 0,
  valueCeil: undefined
}

var colorScales = [
  d3.interpolateViridis
  // d3.interpolateInferno
]

var hexOverlay = L.hexbinLayer(options);
hexOverlay.addTo(map)
.hexClick(function(d) {
  currentColorScaleIndex = (currentColorScaleIndex + 1) % colorScales.length;
  hexOverlay.colorScale(d3.scaleSequential(colorScales[currentColorScaleIndex]));
});

var cb = {};
var poi = [];
var totals = new Map();
var totalsarr = [];
var currentColorScaleIndex = 0;
var labelFilter = new Set();
var hexValueCounts = [];
var hexLayerCounts = new Map();
var pdistances = [];

var IDF_WEIGHT = 1.0;
var UNQ_WEIGHT = 1.0;

// Set up data bindings
v1 = new Vue({
  el: '#datalayers',
  data: { arr:totalsarr },
  methods: {
    modFilterWrapper: (idx) => {
      console.log('>>>>', idx);
      v1.arr[idx].active = !v1.arr[idx].active;
      modFilter(v1.arr[idx].term);
    }
  }
});

v2 = new Vue({
  el: '#control-buttons',
  data: {
    IDF_WEIGHT:IDF_WEIGHT,
    UNQ_WEIGHT:UNQ_WEIGHT
   },
  methods: {
    modIdfWeight: (w) => {
      modIdfWeight(w, hexOverlay);
    },
    modUnqWeight: (w) => {
      modUnqWeight(w, hexOverlay);
    }
  }
});

v3 = new Vue({
  el: '#pdist',
  data: {
    pdists: pdistances
  }
})

var poiOverlay = L.d3SvgOverlay(function(sel, proj) {
  console.log(proj.scale)
  var poiUpd = sel.selectAll('circle').data(poi)
    .enter()
    .append('circle')
    .attr('r',function(d){return 3.0 / proj.scale})
    .attr('cx',function(d){return proj.latLngToLayerPoint(d.slice(1).reverse()).x;})
    .attr('cy',function(d){return proj.latLngToLayerPoint(d.slice(1).reverse()).y;})
    .attr('stroke','#E76F51')
    .attr('stroke-width',.2)
    .attr('fill', '#2A9D8F')
    .attr('fill-opacity', .37)
}, {zoomDraw:true});

function modFilter(term) {
  console.log('mod filter', term);
  if (labelFilter.has(term)) {
    labelFilter.delete(term);
  } else {
    labelFilter.add(term);
  }
  hexOverlay.data(poiFilter());
}

function modIdfWeight(val, hexOverlay) {
  IDF_WEIGHT = IDF_WEIGHT + val;
  v2.IDF_WEIGHT = IDF_WEIGHT;
  changeValueFunction('sumScaledCounter');
}
function modUnqWeight(val, hexOverlay) {
  UNQ_WEIGHT = UNQ_WEIGHT + val;
  v2.UNQ_WEIGHT = UNQ_WEIGHT;
  changeValueFunction('sumScaledCounter');
}

function poiFilter(a) {
  return _.reject(poi, (d) => labelFilter.has(d[0]));
}

function calculateHexValues(hexOverlay) {
  return hexOverlay.hexagons[0].map((path) => {
    return { point: [path.__data__.i,path.__data__.j], value: hexOverlay.options.value(path.__data__) };
  });
}

function calculateHexagonValueCounts(hexOverlay) {
  return hexOverlay.hexagons[0].map((path) => {
    return _.countBy(path.__data__, (elem) => elem.d[0]);
  });
}

function calculateHexagonLayerCounts(hexValueCounts, totals) {
  var temp = {};
  for (var k of totals.keys()) {
    temp[k] = _.filter(hexValueCounts, (elem) => k in elem ).length;
  }
  return temp;
}

function pairwiseLayerDifferences(hexValueCounts, hexLayerCounts) {
  return [...enumerateLayerPairs()].map( (p) => {
    return _layerDifference(hexValueCounts, p[0], p[1]);
  });
}

function highlightHexagons(num) {
  var hexrank = hexOverlay.hexagons[0].map((a) => +a.getAttribute('value'));
  var top = hexrank.sort().slice(-num);
  console.log('top[0] ->', top[0])
  d3.select('g').selectAll('path.hexbin-hexagon')
    .filter((d) => hexOverlay.options.value(d) >= top[0])
    .style('stroke', 'red')
    .style('stroke-width', '4');
}

function _layerDifference(hexValueCounts, term1, term2) {
  var overlap = 0;

  if (!(totals.has(term1) && totals.has(term2))) {
    console.log(`Layer does not exist ->
      ${term1}-${totals.has(term1)} ${term2}-${totals.has(term2)}`);
    return [-1,-1];
  }

  var t1overlap = [term1, 0, hexLayerCounts[term1]];
  var t2overlap = [term2, 0, hexLayerCounts[term2]];

  var bcDistance = 0;

  for (var i = 0; i < hexValueCounts.length; i++) {
    if (term1 in hexValueCounts[i] && term2 in hexValueCounts[i]) {
      overlap += 1
      t1overlap[1] += hexValueCounts[i][term1];
      t2overlap[1] += hexValueCounts[i][term2];

      bcDistance += Math.sqrt(hexValueCounts[i][term1] * hexValueCounts[i][term2]);
    }
  }
  bcDistance = -1 * Math.log(bcDistance);
  return {'overlap':overlap,
          't1overlap':t1overlap,
          't2overlap':t2overlap,
          'bcDistance': bcDistance};
}

function* enumerateLayerPairs() {
  if (totals.size < 2) {
    console.log('therr be a size problem mateyyyyy har har har');
    return;
  }
  var keys = [...totals.keys()];

  for(var i = 0; i < totals.size - 1; i++) {
    for (var j = i + 1; j < totals.size; j++) {
      yield [keys[i], keys[j]];
    }
  }
}

function changeDataLayer() {
  d3.select('#datalayers').selectAll('button')
    .data(totals.keys())
    .enter()
    .append('button')
    .classed('btn btn-defualt', true)
    .text(function(d){ return d + ' ' + totals.get(d); })
}

function changeValueFunction (algo) {
  switch (algo) {
    case 'uniqueCellCounter':
      hexOverlay.options.value = uniqueCellCounter;
      break;
    case 'sumCellCounter':
      hexOverlay.options.value = sumCellCounter;
      break;
    case 'logSumCellCounter':
      hexOverlay.options.value = logSumCellCounter;
      break;
    case 'sumScaledCounter':
      hexOverlay.options.value = sumScaledCounter(UNQ_WEIGHT, IDF_WEIGHT);
      break;
    default:
      hexOverlay.options.value = function(d) { return d.length; }
      break;
    }

    hexOverlay.initialize(hexOverlay.options);
    hexOverlay.data(poiFilter());
}

function changeHexScale(amt) {
  var data = hexOverlay._data;
  hexOverlay.initialize(hexOverlay.options);
  hexOverlay.data(data);
}

function uniqueCellCounter(d){
  var s = d.reduce(function(a, b){
    return a.add(b.d[0])},
    new Set()).size;
  return s;
}

function sumCellCounter(d) {
  return d.length;
}

function logSumCellCounter(d) {
  return 10.0 * Math.log(d.length);
}

function sumScaledCounter(uniqueweight, idfweight) {
  return function(d) {
    var u = uniqueCellCounter(d);
    var v = d.reduce( function(a,b){
      return 1.0 / Math.pow(totals.get(b.d[0]), idfweight) + a;
    },0)
    return v * Math.pow(u, uniqueweight);
  }
}

function searchTerms(terms) {

  d3.json('/api/radar/' + terms, function(data) {
    data.terms.forEach( function(term) {
      if (data[term].length > 0) {
        poi = poi.concat(data[term]);
        totals.set(term, data[term].length);
        totalsarr.push({term:term, count:data[term].length, active:true});
      } else {
        console.log(term, ' - blank response')
      }
    });

    changeDataLayer()

    hexOverlay.colorScale(d3.scaleSequential(colorScales[currentColorScaleIndex]))
    hexOverlay.data(poiFilter());

    hexValueCounts = calculateHexagonValueCounts(hexOverlay);
    hexLayerCounts = calculateHexagonLayerCounts(hexValueCounts, totals);
    v3.pdists = pairwiseLayerDifferences(hexValueCounts, hexLayerCounts);
  });
}
