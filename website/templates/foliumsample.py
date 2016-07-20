import folium
from folium import plugins

wm = folium.Map(location=location, zoom_start=13)
folium.CircleMarker(location=upsamp[sub,:], # !!!! lat long
                    radius=75,
                    fill_opacity=.6,
                    color= colors[idx], # hex color like #565464
                    ).add_to(wm)


# wm.add_children(plugins.ImageOverlay())
# link to image overlay params (gotta read the script!)
# https://github.com/python-visualization/folium/blob/master/folium/plugins/image_overlay.py
