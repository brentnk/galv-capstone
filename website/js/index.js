
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
  // value:  cb.uniqueCellCounter,
  valueFloor: 0,
  valueCeil: undefined
}

var cb = { state: {}, valueFunctions: {}, colorScales: [] };
cb.state.poi = [];
cb.state.totals = [];
cb.state.totalsarr = [];
cb.state.currentColorScaleIndex = 0;
cb.state.labelFilter = [];
cb.state.hexValueCounts = [];
cb.state.hexLayerCounts = new Map();
cb.state.idf_weight = 1.0;
cb.state.valueAlgorithmString = 'sumScaledCounter';
cb.state.searchString = '';
cb.state.currentColorScaleIndex = 1;

cb.mapOptions = mapOptions;
cb.hexbinOptions = hexbinOptions;

var _map = L.map("map-canvas", cb.mapOptions);
cb._map = _map;
cb.mapBaseLayer   = L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
{ attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://cartodb.com/attributions">CartoDB</a>' }
)
cb.state.hexOverlay = L.hexbinLayer(cb.hexbinOptions);

cb.state.hexOverlay.addTo(cb._map)
  // .hexClick(function(d) {
  //   currentColorScaleIndex = (currentColorScaleIndex + 1) % this.colorScales.length;
  //   hexOverlay.colorScale(d3.scaleSequential(colorScales[currentColorScaleIndex]));
  // });
cb.mapBaseLayer.addTo(cb._map);

cb.colorScales = [
  d3.interpolateViridis,
  d3.interpolateInferno,
  d3.interpolateMagma
]


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

cb.refreshData = function() {
  console.log(this);
  this.con.hexOverlay.data.bind(this.con.map,this.poiFilter());
};

cb.modFilter = function(term) {
  console.log('mod filter', term);
  if (this.con.labelFilter.includes(term)) {
    this.con.labelFilter = _.reject((t) => t == term);
  } else {
    this.con.labelFilter.push(term);
  }
  this.con.hexOverlay.data(cb.poiFilter());
}

cb.modIdfWeight = function (val) {
  console.log(this.con);
  this.con.idf_weight = this.con.idf_weight + val;

  this.changeValueFunction('sumScaledCounter');
}

cb.poiFilter = function (a) {
  return _.reject(this.con.poi, (d) => this.con.labelFilter.includes(d[0]));
}

cb.calculateHexValues = function () {
  return this.con.hexOverlay.hexagons[0].map((path) => {
    return { point: [path.__data__.i,path.__data__.j], value: this.con.hexOverlay.options.value(path.__data__) };
  });
}

cb.calculateHexagonValueCounts = function () {
  return this.con.hexOverlay.hexagons[0].map((path) => {
    return _.countBy(path.__data__, (elem) => elem.d[0]);
  });
}

cb.calculateHexagonLayerCounts = function () {
  var temp = {};
  for (var k of Object.keys(this.con.totals)) {
    temp[k] = _.filter(this.con.hexValueCounts, (elem) => k in elem ).length;
  }
  return temp;
}

cb.pairwiseLayerDifferences = function () {
  return [...this.enumerateLayerPairs()].map( (p) => {
    return this._layerDifference(this.con.hexValueCounts, p[0], p[1]);
  });
}

cb._layerDifference = function (term1, term2) {
  var overlap = 0;

  if (!(this.con.totals.includes(term1) && this.con.totals.includes(term2))) {
    console.log(`Layer does not exist ->
      ${term1}-${this.con.totals.includes(term1)} ${term2}-${this.con.totals.includes(term2)}`);
    return [-1,-1];
  }

  var t1overlap = [term1, 0, this.con.hexLayerCounts[term1]];
  var t2overlap = [term2, 0, this.con.hexLayerCounts[term2]];

  var bcDistance = 0;

  for (var i = 0; i < this.con.hexValueCounts.length; i++) {
    if (term1 in this.con.hexValueCounts[i] && term2 in this.con.hexValueCounts[i]) {
      overlap += 1
      t1overlap[1] += this.con.hexValueCounts[i][term1];
      t2overlap[1] += this.con.hexValueCounts[i][term2];

      bcDistance += Math.sqrt(this.con.hexValueCounts[i][term1] * this.con.hexValueCounts[i][term2]);
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
      this.con.hexOverlay.options.value = cb.valueFunctions.uniqueCellCounter;
      break;
    case 'sumCellCounter':
      this.con.hexOverlay.options.value = cb.valueFunctions.sumCellCounter;
      break;
    case 'logSumCellCounter':
      this.con.hexOverlay.options.value = cb.valueFunctions.logSumCellCounter;
      break;
    case 'sumScaledCounter':
      this.con.hexOverlay.options.value = cb.valueFunctions.sumScaledCounter(this.con.idf_weight);
      break;
    default:
      this.con.hexOverlay.options.value = function(d) { return d.length; }
      break;
    }

    this.con.hexOverlay.initialize(this.con.hexOverlay.options);
    console.log(this);
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
      return b.d.length < 4? (1.0 / this.con.totals.get(b.d[0])) + a: b.d[3] + a ;
    },0)
    return v * Math.pow(s, idfweight);
  }
}

cb.searchTerms = function () {
  var that = this;
  if (this.con.searchString.length < 1) {
    return;
  }
  this.con.searchString = '';
  d3.json('/api/radar/' + this.con.searchTerms, function(data) {
    data.terms.forEach( function(term) {
      that.con.poi = that.con.poi.concat(data[term]);
      that.con.totalsarr.push({term:term, count:data[term].length, active:true});
    });
    console.log(that);

    that.con.totals = _.countBy((x) => x[0]);

    that.con.hexOverlay.colorScale.bind(that.con.map, d3.scaleSequential(cb.colorScales[that.con.currentColorScaleIndex]))
    that.refreshData();

    that.con.hexValueCounts = that.calculateHexagonValueCounts();
    that.con.hexLayerCounts = that.calculateHexagonLayerCounts();
  });
}

// Set up data bindings
var v = window.v = new Vue({
  el: '#controlbox',
  data: {
    con: cb.state
  },
  methods: {
    changeValueFunction:         cb.changeValueFunction,
    modIdfWeight:                cb.modIdfWeight,
    modFilterWrapper:            cb.modFilterWrapper,
    refreshData:                 cb.refreshData,
    poiFilter:                   cb.poiFilter,
    searchTerms:                 cb.searchTerms,
    calculateHexagonLayerCounts: cb.calculateHexagonLayerCounts,
    calculateHexagonValueCounts: cb.calculateHexagonValueCounts
  }
});
