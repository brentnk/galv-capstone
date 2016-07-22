function handleSearch(e) {
  if(e.keyCode === 13) {
    var term = document.getElementById('searchBox')
    console.log('handleSearch() ' + term.value)
    searchTerms(term.value)
    term.value = ''
  }
}

var map = L.map("map-canvas",{center:[39.7047, -105.0814],zoom:11});
L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',{ attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://cartodb.com/attributions">CartoDB</a>' }).addTo(map);

var valueAlgorithm = 'sumScaledCounter';
var options = {
  radiusRange: [7,7],
  radius: 7,
  opacity: 0.47,
  lng: function(d){ return d[1]; },
  lat: function(d){ return d[2]; },
  value: uniqueCellCounter,
  valueFloor: 0,
  valueCeil: undefined
}

var hexOverlay = L.hexbinLayer(options);
hexOverlay.addTo(map);

var poi = [];
var totals = {}

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
}, {zoomDraw:true})

function changeValueFunction (algo) {
  switch (algo) {
    case 'uniqueCellCounter':
      hexOverlay.options.value = uniqueCellCounter;
      console.log('uniqueCellCounter');
      break;
    case 'sumCellCounter':
      hexOverlay.options.value = sumCellCounter;
      console.log('sumCellCounter');
      break;
    case 'logSumCellCounter':
      hexOverlay.options.value = logSumCellCounter;
      console.log('logSumCellCounter');
      break;
    case 'sumScaledCounter':
      hexOverlay.options.value = sumScaledCounter;
      console.log('sumScaledCounter');
      break;
    default:
      hexOverlay.options.value = function(d) { return d.length; }
      console.log('defaultCellCounter');
      break;
    }

    // var data = hexOverlay._data;
    hexOverlay.colorScale(d3.scaleSequential(d3.interpolateViridis))
    hexOverlay.initialize(hexOverlay.options);
    hexOverlay.data(poi);
    hexOverlay._redraw();
}

function changeHexScale(amt) {
  var data = hexOverlay._data;
  hexOverlay.initialize(hexOverlay.options);
  hexOverlay.data(data);
  hexOverlay._redraw()
}

function uniqueCellCounter(d){
  // console.log(d);
  var s = d.reduce(function(a, b){
    return a.add(b.d[0])},
    new Set()).size;
  return s;
}

function sumCellCounter(d) {
  return d.length;
}

function logSumCellCounter(d) {
  // console.log(Math.log(d.length));
  return 10.0 * Math.log(d.length);
}

function sumScaledCounter(d) {
  var s = d.reduce(function(a, b){
    return a.add(b.d[0])},
    new Set()).size;
  var v = d.reduce( function(a,b){
    // console.log(b.d)
    return b.d.length < 4? (1.0 / totals[b.d[0]]) + a: b.d[3] + a ;
  },0)
  // console.log(poi.length, d.length, v / s, poi.length * (v / s))
  if(v==0 || s==0) {console.out('v,s', v, s);}
  return v / s;
}

function searchTerms(terms) {
  d3.json('/api/radar/' + terms, function(data) {
    console.log(data)
    data.terms.forEach( function(term) {
      poi = poi.concat(data[term]);
      totals[term] = data[term].length
    });

    hexOverlay.colorScale(d3.scaleSequential(d3.interpolateViridis))
    hexOverlay.data(poi)
  });
}
