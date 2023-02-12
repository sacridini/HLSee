function reproject_sen2ls(sentinel_image, landsat_image) {
  var sentinel_30m = sentinel_image.resample('bicubic').reproject({
  crs: landsat_image.select('red').projection().crs(),
  scale: 30
  }).set('system:time_start', sentinel_image.date());
  return(sentinel_30m);
}

exports.reproject_sen2ls = reproject_sen2ls;