import requests
import json
import numpy as np
from multiprocessing import Pool
import functools
# from elasticsearch import Elasticsearch
from sklearn.cluster import MeanShift



def check_cached(lat=0.0, lon=0.0, terms = {}, meters=500, db=None):
    aql = ( "for doc in near('radar', @latt, @lonn, 100, @meters) filter doc.keyword == @keyword && "
            "doc.name == @name && doc.type == @type return doc")
    bind_vars = {'latt': lat, 'lonn': lon, 'meters': str(meters), 'type': '', 'keyword': '', 'name': ''}
    bind_vars.update(terms)
    qres = db.AQLQuery(aql, rawResults=False, batchSize=100, bindVars=bind_vars)

    return qres.response['result']

def escheck_cached(lat=0.0, lon=0.0, terms = {}, meters=500, db=None):
    sea = {
        'index': ['depth-radar'],
        'query': {
            'bool': {
                'must': {
                    { 'match_all': {} }
                },
                'filter':{
                    'geo_distance': {
                        'distance': '500m',
                        'poi.location'
                    }
                }
            }
        }

    }


def radar(coords, termdict, db, force=False, radius=20000, key='', do_cache=True,
    upsample=0, make_clusters=True):
    '''Calls the Google Radar Api'''
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

    if make_clusters:
        collection = cluster_results(collection)

    if upsample > 0:
        pool = Pool(8)
        print('upsampling {} results...'.format(len(collection)))
        pp = functools.partial(rayleigh_upsample,mean_shift=.0105, samples=upsample, mean=4)
        # collection = [[tag] + x[1:] for x in collection] # add tag to each point
        # ups = pool.map(pp, np.array([x[1:] for x in collection]))
        ups = pool.map(pp, np.array(collection))
        pool.close()
        pool.join()
        for u in ups:
            for p in u:
                collection.append(p)

    # tag collection
    tag = params['keyword'] if params['keyword'] != '' else params['type']
    print('tagging collection {}'.format(tag))
    for point in collection:
        point.insert(0,tag)
        point.append(1.0 / (len(u) * .75))

    return collection

def cluster_results(results):
    model = MeanShift(bandwidth=0.015, cluster_all=False)
    print(results[0])
    res = model.fit(np.array(results)[:,1:].astype(float))
    print('cluster centers shape: {}'.format(res.cluster_centers_.shape))
    return res.cluster_centers_.tolist()

def rayleigh_upsample(loc=np.array([0.0,0.0]), mean_shift=1, samples=20, mean=2):
        magnitude = np.random.rayleigh(mean, size=samples) * (mean_shift * 1.0 / mean)
        direction = np.random.rand(samples) * 2 * 3.141559
        return (np.atleast_2d(loc) + pol2cart(magnitude, direction)).tolist()

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
