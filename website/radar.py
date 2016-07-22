import requests
import json
import numpy as np
from multiprocessing import Pool
import functools

def check_cached(lat=0.0, lon=0.0, terms = {}, meters=500, db=None):
    aql = ( "for doc in near('radar', @latt, @lonn, 100, @meters) filter doc.keyword == @keyword && "
            "doc.name == @name && doc.type == @type return doc")
    bind_vars = {'latt': lat, 'lonn': lon, 'meters': str(meters), 'type': '', 'keyword': '', 'name': ''}
    bind_vars.update(terms)
    qres = db.AQLQuery(aql, rawResults=False, batchSize=100, bindVars=bind_vars)

    return qres.response['result']

def radar(coords, termdict, db, force=False, radius=20000, key='', do_cache=True,
    upsample=0):
    basetermdict = {'type': '', 'keyword': '', 'name': ''}
    params = {'location': '{0},{1}'.format(*coords),
              'radius': radius,
              'key': key}
    basetermdict.update(termdict)
    params.update(basetermdict)

    db_col = db['radar']

    root = 'https://maps.googleapis.com/maps/api/place/radarsearch/json'

    cached = check_cached(coords[0], coords[1], terms=basetermdict, db=db)
    collection = []

    if len(cached) > 0 and not force:
        print('Cache hit: {0} {1}'.format(basetermdict, coords))
        collection = parse_gresults(cached[0]['response']['results'], params)
    else:
        print('Cache miss: {0} {1}'.format(basetermdict, coords))
        print('requesting...')
        r = requests.get(root, params=params, timeout=3)
        if r.status_code == requests.codes.ok:
            result_doc = r.json()
            if result_doc['status'] != 'OK':
                print(result_doc.keys())
                print('[ERR]{0} request failed: {1}'.format(result_doc['status'],''))#result_doc['error_message']))
                return collection
            print('[OK] status complete')
            collection = parse_gresults(result_doc['results'], params)

            if do_cache:
                doc = db_col.createDocument(initValues=params)
                doc['location'] = coords
                doc['response'] = result_doc
                doc.save()
            print('cached: complete')


    if upsample > 0:
        pool = Pool(8)
        print('upsampling collection {}...'.format(len(collection)))
        pp = functools.partial(rayleigh_upsample,mean_shift=.0105, samples=upsample, mean=3)
        # print(type(collection))
        tag = params['keyword'] if params['keyword'] != '' else params['type']
        collection = [[tag] + x[1:] for x in collection]
        ups = pool.map(pp, np.array([x[1:] for x in collection]))
        for u in ups:
            for p in u:
                # print(params['keyword'],len(params['keyword']),params['keyword'] != '', params['type'])
                p.insert(0,tag)
                p.append(1.0 / len(u))
                collection.append(p)

    return collection

def rayleigh_upsample(loc=np.array([0.0,0.0]), mean_shift=1, samples=20, mean=2):
        magnitude = np.random.rayleigh(mean, size=samples) * (mean_shift * 1.0 / mean)
        direction = np.random.rand(samples) * 2 * 3.141559
        return (np.atleast_2d(loc) + pol2cart(magnitude, direction)).tolist()

def upsample_feature(f):
    fill_template = lambda a: {'type': 'Feature', 'properties': {'name': f['properties']['name']},
        'geometry': { 'type': 'Point', 'coordinates': a}}
    if f['geometry']['type'] == 'Point':
        for point in rayleigh_upsample(loc=np.array(f['geometry']['coordinates'][::-1]),
            mean_shift=.01, samples=50, mean=2).tolist():
            yield fill_template(point)
    else:
        print('[{}] upsample feature invalid type'.format(f['geometry']['type']))
        yield None

def parse_gresults(results, params):
    collection = []

    for v in results:
        collection.append([params['keyword'],float(v['geometry']['location']['lng']),
                   float(v['geometry']['location']['lat'])])
    return collection

def cart2pol(x, y):
    rho = np.sqrt(x**2 + y**2)
    phi = np.arctan2(y, x)
    return np.r_[rho, phi]

def pol2cart(rho, phi):
    x = rho * np.cos(phi)
    y = rho * np.sin(phi)
#     print(x.shape, y.shape)
    return np.vstack((x, y)).T

if __name__ == '__main__':
    pass
