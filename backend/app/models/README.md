# ImageLab Medical Deep-Learning Model Directory

ImageLab keeps mathematical analysis (PCA, SVD) strictly separated from deep-learning medical image classification.

## Classification Model (`classification/`)
To enable real Brain MRI classification in `POST /api/medical/classify`, place the trained PyTorch ResNet50 artifacts exported from Google Colab into `backend/app/models/classification/`:

1. `resnet50_brain_tumor.pth` — PyTorch `state_dict` (or checkpoint dict containing `model_state_dict`) for `torchvision.models.resnet50` with the final `fc` layer sized to the number of classes.
2. `class_labels.json` — JSON array of class names in index order, e.g.:
   ```json
   ["glioma", "meningioma", "notumor", "pituitary"]
   ```
3. `preprocessing_config.json` — Normalization and resize parameters used during training, e.g.:
   ```json
   {
     "model_version": "resnet50-brain-mri-v1",
     "input_size": 224,
     "mean": [0.485, 0.456, 0.406],
     "std": [0.229, 0.224, 0.225]
   }
   ```

## Optional Segmentation Model (`segmentation/`)
If using a separate U-Net segmentation model, place `unet_brain_tumor.pth` and `segmentation_config.json` in `backend/app/models/segmentation/`.

When model files are absent, ImageLab honestly reports `MODEL_NOT_CONFIGURED` (HTTP 503) and never fabricates predictions or masks.
