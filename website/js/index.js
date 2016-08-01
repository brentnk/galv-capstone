function handleSearch(e) {
  if(e.keyCode === 13) {
    var term = document.getElementById('searchBox')
    console.log('handleSearch() ' + term.value)
    searchTerms(term.value)
    term.value = ''
  }
}

var mapOptions = {
  center:[39.7047, -105.0814],
  zoom:11,
  minZoom:10,
  maxZoom:12
}
var hexbinOptions = {
  radiusRange: [9,9],
  radius: 9,
  opacity: 0.47,
  lng: function(d){ return d[1]; },
  lat: function(d){ return d[2]; },
  value: uniqueCellCounter,
  valueFloor: 0,
  valueCeil: undefined
}

var cb = {};
cb.state.poi = [];
cb.state.totals = [];
cb.state.totalsarr = [];
cb.state.currentColorScaleIndex = 0;
cb.state.labelFilter = [];
cb.state.hexValueCounts = [];
cb.state.hexLayerCounts = new Map();
cb.state.idf_weight = 1.0;
cb.state.valueAlgorithmString = 'sumScaledCounter';

cb.mapOptions = mapOptions;
cb.hexbinOptions = hexbinOptions;

cb.map = L.map("map-canvas", cb.mapOptions);
cb.mapBaseLayer   = L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
{ attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://cartodb.com/attributions">CartoDB</a>' }
)
cb.state.hexOverlay = L.hexbinLayer(cb.hexbinOptions);

cb.state.hexOverlay.addTo(map)
  .hexClick(function(d) {
    currentColorScaleIndex = (currentColorScaleIndex + 1) % colorScales.length;
    hexOverlay.colorScale(d3.scaleSequential(colorScales[currentColorScaleIndex]));
  });
cb.mapBaseLayer.addTo(map);



var colorScales = [
  d3.interpolateViridis,
  d3.interpolateInferno,
  d3.interpolateMagma
]

// .hexMouseOver(function(d) {
//     d3.select(this)
//       .style("stroke-width", 1.5)
//       .style("opacity", 0.90)
//     d3.select("#json-print")
//       .style("color", "#ccc")
//       .text(JSON.stringify(d,undefined, 2));
// })
// .hexMouseOut(function(d) {
//   d3.select(this)
//     .style("stroke-width", null);
//   d3.select("#json-print")
//     .style("color", null)
//     .text(JSON.stringify(d,undefined, 2));)
;



// Set up data bindings
v1 = new Vue({
  el: '#datalayers',
  data: { arr:totalsarr },
  // methods: { modFilterWrapper: ()=> console.log()}
  methods: {
    modFilterWrapper: (idx) => {
      console.log('>>>>', idx);
      v1.arr[idx].active = !v1.arr[idx].active;
      modFilter(v1.arr[idx].term);
    }
  }
});

v2 = new Vue({
  el: '#idf-group',
  data: { IDF_WEIGHT:IDF_WEIGHT },
  methods: {
    modIdfWeight: (w) => {
      modIdfWeight(w, hexOverlay);
    }
  }
});

v = Vue({
  el: '#controlbox',
  data: {
    con: cb.state
  }
});

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

cb.refreshData = () => this.state.hexOverlay.data(this.poiFilter());

cb.modFilter = function(term) {
  console.log('mod filter', term);
  if (this.state.labelFilter.includes(term)) {
    this.state.labelFilter = _.reject((t) => t == term);
  } else {
    this.state.labelFilter.push(term);
  }
  this.state.hexOverlay.data(cb.poiFilter());
}

cb.modIdfWeight = function (val) {
  this.state.idf_weight = this.state.idf_weight + val;

  this.changeValueFunction('sumScaledCounter');
}

cb.poiFilter = function (a) {
  return _.reject(poi, (d) => this.state.labelFilter.includes(d[0]));
}

cb.calculateHexValues = function () {
  return this.state.hexOverlay.hexagons[0].map((path) => {
    return { point: [path.__data__.i,path.__data__.j], value: this.state.hexOverlay.options.value(path.__data__) };
  });
}

cb.calculateHexagonValueCounts = function () {
  return this.state.hexOverlay.hexagons[0].map((path) => {
    return _.countBy(path.__data__, (elem) => elem.d[0]);
  });
}

cb.calculateHexagonLayerCounts = function () {
  var temp = {};
  for (var k of this.state.totals.keys()) {
    temp[k] = _.filter(this.state.hexValueCounts, (elem) => k in elem ).length;
  }
  return temp;
}

cb.pairwiseLayerDifferences = function () {
  return [...this.enumerateLayerPairs()].map( (p) => {
    return this._layerDifference(this.state.hexValueCounts, p[0], p[1]);
  });
}

cb._layerDifference(term1, term2) {
  var overlap = 0;

  if (!(this.state.totals.includes(term1) && this.state.totals.includes(term2))) {
    console.log(`Layer does not exist ->
      ${term1}-${this.state.totals.includes(term1)} ${term2}-${this.state.totals.includes(term2)}`);
    return [-1,-1];
  }

  var t1overlap = [term1, 0, this.state.hexLayerCounts[term1]];
  var t2overlap = [term2, 0, this.state.hexLayerCounts[term2]];

  var bcDistance = 0;

  for (var i = 0; i < this.state.hexValueCounts.length; i++) {
    if (term1 in this.state.hexValueCounts[i] && term2 in this.state.hexValueCounts[i]) {
      overlap += 1
      t1overlap[1] += this.state.hexValueCounts[i][term1];
      t2overlap[1] += this.state.hexValueCounts[i][term2];

      bcDistance += Math.sqrt(this.state.hexValueCounts[i][term1] * this.state.hexValueCounts[i][term2]);
    }
  }
  bcDistance = -1 * Math.log(bcDistance);
  return {'overlap':overlap,
          't1overlap':t1overlap,
          't2overlap':t2overlap,
          'bcDistance': bcDistance};
}

cb.enumerateLayerPairs = function* () {
  if (this.totals.size < 2) {
    console.log('therr be a size problem mateyyyyy har har har');
    return;
  }
  var keys = [...this.totals.keys()];

  for(var i = 0; i < this.totals.size - 1; i++) {
    for (var j = i + 1; j < this.totals.size; j++) {
      // console.log(`${keys[i]} -- ${keys[j]}`);
      yield [keys[i], keys[j]];
    }
  }
}

cb.changeValueFunction = function (algo) {
  switch (algo) {
    case 'uniqueCellCounter':
      this.state.hexOverlay.options.value = uniqueCellCounter;
      break;
    case 'sumCellCounter':
      this.state.hexOverlay.options.value = sumCellCounter;
      break;
    case 'logSumCellCounter':
      this.state.hexOverlay.options.value = logSumCellCounter;
      break;
    case 'sumScaledCounter':
      this.state.hexOverlay.options.value = sumScaledCounter(IDF_WEIGHT);
      break;
    default:
      this.state.hexOverlay.options.value = function(d) { return d.length; }
      break;
    }

    this.state.hexOverlay.initialize(this.state.hexOverlay.options);
    this.refreshData();
}

cb.valueFunctions.uniqueCellCounter = function(d){
  // console.log(d);
  var s = d.reduce(function(a, b){
    return a.add(b.d[0])},
    new Set()).size;
  return s;
}

cb.valueFunctions.sumCellCounter = function(d) {
  return d.length;
}

cb.valueFunctions.logSumCellCounter = function(d) {
  return 10.0 * Math.log(d.length);
}

cb.valueFunctions.sumScaledCounter = function(idfweight) {
  return function(d) {
    var s = cb.valueFunctions.uniqueCellCounter(d);
    var v = d.reduce( function(a,b){
      return b.d.length < 4? (1.0 / this.state.totals.get(b.d[0])) + a: b.d[3] + a ;
    },0)
    return v * Math.pow(s, idfweight);
  }
}

cb.searchTerms = function (terms) {
  d3.json('/api/radar/' + terms, function(data) {
    data.terms.forEach( function(term) {
      this.state.poi = this.state.poi.concat(data[term]);
      totalsarr.push({term:term, count:data[term].length, active:true});
    });
    cb.state.totals = _.countBy((x) => x[0]);

    cb.state.hexOverlay.colorScale(d3.scaleSequential(colorScales[currentColorScaleIndex]))
    cb.state.hexOverlay.data(cb.poiFilter());

    hexValueCounts = calculateHexagonValueCounts(hexOverlay);
    hexLayerCounts = calculateHexagonLayerCounts(hexValueCounts, totals);
  });
}
