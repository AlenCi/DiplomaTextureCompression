import sys
import numpy as np
from colour import delta_E, RGB_to_XYZ, XYZ_to_Lab, io, RGB_COLOURSPACES

def compute_delta_e(original_path, compressed_path):
    # Read images (returns 0-1 float arrays)
    orig_img = io.read_image(original_path)
    comp_img = io.read_image(compressed_path)

    # Ensure the image has only three channels (RGB)
    orig_img = orig_img[..., :3]  # Remove alpha if present
    comp_img = comp_img[..., :3]  # Remove alpha if present

    # Define the colourspace (assuming sRGB)
    colourspace = RGB_COLOURSPACES["sRGB"]

    # Convert RGB to XYZ
    orig_xyz = RGB_to_XYZ(orig_img, colourspace)
    comp_xyz = RGB_to_XYZ(comp_img, colourspace)

    # Convert XYZ to LAB
    orig_lab = XYZ_to_Lab(orig_xyz)
    comp_lab = XYZ_to_Lab(comp_xyz)

    # Compute per-pixel Delta E (CIEDE2000 by default)
    delta_e = delta_E(orig_lab, comp_lab, method="CIE 2000")
    avg_delta_e = np.mean(delta_e)
    print(f"{avg_delta_e}")
    return avg_delta_e

if __name__ == "__main__":
    compute_delta_e(sys.argv[1], sys.argv[2])
