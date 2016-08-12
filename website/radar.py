import requests
import json
import numpy as np
from multiprocessing import Pool
import functools
from elasticsearch import Elasticsearch
from elasticsearch_dsl import Search, Q, DocType, String, Date, GeoPoint
from sklearn.cluster import MeanShift
from datetime import datetime
import pytz

class Poi(DocType):
    keyword = String()
    location = GeoPoint()
    qlocation = GeoPoint()
    placeid = String()
    ts = Date()

    class Meta:
        index = 'depth-radar'

    def save(self, ** kwargs):
        self.ts = datetime.now()
        return super().save(** kwargs)

def escheck_cached(lat=0.0, lon=0.0, terms = {}, meters=500, db=None):
    s = Search(using=db, index='depth-radar')
    s = s.filter('geo_distance', distance=str(meters)+'m',
                   qlocation={'lat': lat, 'lon': lon})

    return s.execute()


def get_radar(coords, radius, key, params):
    root = 'https://maps.googleapis.com/maps/api/place/radarsearch/json'
    r = requests.get(root, params=params, timeout=3)
    if r.status_code == requests.codes.ok:
        result_doc = r.json()
        if result_doc['status'] != 'OK':
            print(result_doc.keys())
            print('[ERR]{0} request failed: {1}'.format(result_doc['status'],''))#result_doc['error_message']))
            return collection
        print('[OK] status complete')
    return result_doc['results']


def radar(coords, termdict, db, force=False, radius=20000, key='', do_cache=True,
    upsample=0, make_clusters=True):
    '''Calls the Google Radar Api'''
    basetermdict = {'type': '', 'keyword': '', 'name': ''}
    params = {'location': '{0},{1}'.format(*coords),
              'radius': radius,
              'key': key}
    basetermdict.update(termdict)
    params.update(basetermdict)

    cached = escheck_cached(coords[0], coords[1], terms=basetermdict, db=db)
    collection = []

    if len(cached) > 0 and not force:
        print('Cache hit: {0} {1}'.format(basetermdict, coords))
        collection = extract_es(cached)
    else:
        print('Cache miss: {0} {1}'.format(basetermdict, coords))
        print('requesting...')
        res = get_radar(coords, radius, key, params)
        collection = parse_gresults(res, params)

        if do_cache:
            for x in collection:
                print(x)
                doc = Poi()
                doc.keyword = x[0]
                doc.location = [ x[1], x[2] ]
                doc.qlocation =  coords[::-1]

                doc.save(using=db)
            print('cached: complete')

    if make_clusters:
        collection = cluster_results(collection)

    if upsample > 0:
        pool = Pool(8)
        print('upsampling {} results...'.format(len(collection)))
        pp = functools.partial(rayleigh_upsample,mean_shift=.0105, samples=upsample, mean=4) # PYTHON 3.5+ !!!
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

def extract_es(results):
    return [[x.keyword]+list(x.location) for x in results]
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
