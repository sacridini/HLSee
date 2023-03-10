function band_adjustment_landsat(landsat_image) {

    var interceptsL8 = [-0.0107,0.0026,-0.0015,0.0033,0.0065,0.0046];
    var slopesL8 = [1.0946,1.0043,1.0524,0.8954,1.0049,1.0002];
  
    var imgL8SR_bandadj = ee.Image(landsat_image
                            .multiply(slopesL8)
                            .add(interceptsL8).float()
                            .copyProperties(landsat_image))
                            .set('system:time_start',landsat_image.get('system:time_start'));
    return(imgL8SR_bandadj);
  }
  
  exports.band_adjustment_landsat = band_adjustment_landsat;