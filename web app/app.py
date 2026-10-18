import streamlit as st
import os
try:
    from streamlit_image_comparison import image_comparison
except ImportError:
    st.error("Missing dependency: `streamlit-image-comparison`. Please install it using `pip install streamlit-image-comparison`.")
    st.stop()

# Set page title
st.set_page_config(page_title="Verifex Forensic Comparison", page_icon="🔍")

st.title("Verifex Forensic Comparison")
st.write("Compare the original authentic image with the Verifex forensic analysis heatmap.")

# Update the paths to the new image files using relative paths
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
img_original = os.path.join(ROOT_DIR, "web", "assets", "11111.png")
img_processed = os.path.join(ROOT_DIR, "web", "assets", "22222.png")

# Verify that the files exist at these locations before rendering the slider
if os.path.exists(img_original) and os.path.exists(img_processed):
    # Image comparison slider
    image_comparison(
        img1=img_original,
        img2=img_processed,
        label1="Original Image",
        label2="Verifex Heatmap"
    )
else:
    st.error("Error: Image assets not found at the specified locations.")
    st.write(f"Checking Path 1: {img_original} - {'Found' if os.path.exists(img_original) else 'Missing'}")
    st.write(f"Checking Path 2: {img_processed} - {'Found' if os.path.exists(img_processed) else 'Missing'}")

st.info("The slider above allows you to visualize pixel-level anomalies detected by the Verifex neural engine.")
