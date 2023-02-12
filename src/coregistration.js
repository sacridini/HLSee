function co_registration_landsat(landsat_image, sentinel_image) {

    // Choose to register using only the 'Red' band.
    var landsat_red = landsat_image.select('red');
    var sentinel_red = sentinel_image.select('red');
    
    // Determine the displacement by matching only the 'Red' bands.
    var displacement = landsat_red.displacement({
      referenceImage: sentinel_red,
      maxOffset: 50.0,//The maximum offset allowed when attempting to align the input images, in meters
      patchWidth: 100.0 // Small enough to capture texture and large enough that ignorable 
      //objects are small within the patch. Automatically ditermined if not provided 
    });
  
  
    //wrap the imgL8SR image
    var landsat_image_aligned = landsat_image.displace(displacement);
    return(landsat_image_aligned);
  }
  
  exports.co_registration_landsat = co_registration_landsat;